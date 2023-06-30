'use strict';

// prettier-ignore
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

class Workout {
  //using super new JS here
  date = new Date();
  id = (Date.now() + '').slice(-10);
  clicks = 0;
  constructor(coords, distance, duration) {
    this.coords = coords; //in [lat, lng]
    this.distance = distance; //in km
    this.duration = duration; //in min
  }

  _setDescription() {
    //the 'prettier-ignore' comment will not apply prettier formatting to the following line
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  _getCurrentPosition = () => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
  };

  //adding a public interface, now every object gets this method
  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';
  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace(); //it's fine to call functions in the constructor
    this._setDescription(); //we are calling this here because this object contains the type that will be used in the function. we can do this because the constructor method has access to all the parent methods through the scope chain
  }
  calcPace() {
    //in min/km
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling'; //same thing as putting this.type = type in the constructor. since we know that cycling will always be cycling and running will always be running we can do this here.
  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription(); //we are calling this here because this object contains the type that will be used in the function
  }
  calcSpeed() {
    //in km/h
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

// const run1 = new Running([39, -12], 5.2, 24, 178);
// const cycling1 = new Cycling([39, -12], 27, 95, 523);
// console.log(run1, cycling1);

//application architecture
const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const containerSidebar = document.querySelector('.sidebar');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const errorModal = document.getElementById('error-modal');
const closeButton = document.getElementById('close-button');

class App {
  //private instance properties. using super new JS here
  #map;
  #mapEvent;
  #mapZoomLevel = 13;
  #workouts = [];
  #markers = [];
  #shapes = [];
  constructor() {
    //get user's position
    this._getPosition();

    //get data from localStorage
    this._getLocalStorage();

    //draw the marker and create a new workout once the form is submitted. we need to bind the this keyword because the this keyword in an event handler is the DOM element the event listener is added to.
    form.addEventListener('submit', this._newWorkout.bind(this));

    //switch between cadence and elevation gain form inputs. no need to bind the this keyword because it's not used in the toggleElevationField function
    inputType.addEventListener('change', this._toggleElevationField);

    //add a click event listener to the workouts container. since we can't add the event listener to actual workouts because they initially aren't there when the application is loaded
    containerWorkouts.addEventListener(
      'click',
      this._containerAction.bind(this)
    );

    containerSidebar.addEventListener('click', this._sidebarAction.bind(this));

    closeButton.addEventListener('click', this._hideError);
  }

  _getPosition() {
    if (navigator.geolocation)
      //upon success of getting the current position, _loadMap will be called with the position parameter. the this keyword is used because we are in a class now. in a regular function call, the this keyword is set to undefined. the callback function here is not a method call, but a function call, so we have to bind the this keyword. binds return a new function. so js can call it whenever it needs to
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          //will run if getCurrentPosition fails
          alert("Couldn't get your position");
        }
      );
  }

  _loadMap(position) {
    //will run if getCurrentPosition is successful
    const { latitude } = position.coords; //destructure the position.coords object
    const { longitude } = position.coords;

    console.log(`https://www.google.com/maps/@${latitude},${longitude}z`);
    const coords = [latitude, longitude];
    //because we included the leaflet script, L becomes the global namespace for leaflet functions. we just have to make sure we include the leaflet script before inclduing script.js
    this.#map = L.map('map', { drawControl: true }).setView(
      coords,
      this.#mapZoomLevel
    ); //map is an object generated by leaflet

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    //handle map clicks
    this.#map.on('click', this._showForm.bind(this));

    //add ability to draw shapes
    const drawnFeatures = new L.FeatureGroup();
    this.#map.addLayer(drawnFeatures);

    this.#map.on('draw:created', e => {
      this.#shapes.push(e);
      const type = e.layerType;
      const layer = e.layer;
      drawnFeatures.addLayer(layer);
      console.log(this.#shapes);
    });

    //render the workout marker
    this.#workouts.forEach(work => {
      this._renderWorkoutMarker(work);
    });
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;
    form.classList.remove('hidden'); //display the workout form
    inputDistance.focus(); //automatically put the cursor on the distance input
    //.on() is not coming from js, but from leaflet. the callback function uses a map event. that's why mapE is passed as a parameter to this function
  }

  _hideForm() {
    //empty inputs
    inputCadence.value =
      inputDistance.value =
      inputDuration.value =
      inputElevation.value =
        '';
    //we have hide it this way because just adding the hidden class triggers an animation. we don't want the animation. so we will change the display style to 'none' first. then add the hidden class. we have to add the hidden class so we can remove it when we show it. the form element has a 1ms transform property so that's where the animation comes from. we have to set the display back to grid so it'll show again once we remove the hidden class. we add a setTimeout of 1s because we want the hiding animation to play out first when the form's display is none. this is some advanced shit
    form.style.display = 'none';
    form.classList.add('hidden');
    //form.style.display = 'grid';
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _toggleElevationField() {
    //toggle the hidden classes on the elevation and cadence inputs by selecting their parent form row element
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
    inputDistance.focus();
  }

  _newWorkout(e) {
    e.preventDefault(); //pressing the enter key on a form initializes a submit event, thus reloading the page. so we need a preventDefault

    //get data from form
    const type = inputType.value;
    const distance = +inputDistance.value; //the plus converts it to a number
    const duration = +inputDuration.value;
    const { lat, lng } = this.#mapEvent.latlng; //destructure the latlng object
    let workout;
    //if workout is running, create running object. only need to delcare cadence variable if new workout is running
    if (type === 'running') {
      const cadence = +inputCadence.value;
      //validate data
      if (
        // !Number.isFinite(distance) ||
        // !Number.isFinite(duration) ||
        // !Number.isFinite(cadence)
        !this._validInputs(distance, duration, cadence) ||
        !this._allPositive(distance, duration, cadence)
      )
        return this._displayError();

      workout = new Running([lat, lng], distance, duration, cadence);
    }
    //if workout is cycling, create cycling object. only need to declare elevation variable if new workout is cycling
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      if (
        !this._validInputs(distance, duration, elevation) ||
        !this._allPositive(distance, duration)
      )
        return this._displayError();
      workout = new Cycling([lat, lng], distance, duration, elevation);
    }
    //add new object to workout array
    this.#workouts.push(workout);

    //render workout on map as as marker. since this is not a callback function, we don't need to bind the this keyword. we are calling this function ourselves
    this._renderWorkoutMarker(workout);
    //render workout on list
    this._renderWorkout(workout);
    //hide form and clear input fields
    this._hideForm();

    //set local storage to all workouts
    this._setLocalStorage();
  }

  _renderWorkoutMarker(workout) {
    const marker = L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          //getting these object values from the leaflet documentation
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        })
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♂️'} ${workout.description}`
      )
      .openPopup();
    const { lat, lng } = marker._latlng;
    this.#markers.push([lat, lng, marker]); //push the latlng and marker object itself into the markers array so it can be fond later to delete if needed
  }

  _deleteWorkoutMarker(workout) {
    //find the marker based off the workout coordinates and use the remove() method from leaflet to delete it
    const markerToDelete = this._getMarker(workout);
    markerToDelete.remove();
  }

  async _renderWorkout(workout) {
    //geocode the location of the workout with workout.coords and add the result to the workout title
    const data = await this._geoCode(workout.coords);
    const location = data.city ? data.city : data.county;
    //this first part of the html is common to both running and cycling workouts
    let html = `
    <li class="workout workout--${workout.type}" data-id="${workout.id}">
          <h2 class="workout__title">${workout.description} in ${location}
          <div class="workout__actions">
            <button class="workout__action workout__action--edit">Edit</button>
            <button class="workout__action workout__action--delete">Delete</button>
            <button class="workout__action workout__action--save hidden">Save</button>
          </div>
          </h2>
          <div class="workout__details">
            <span class="workout__icon">${
              workout.type === 'running' ? '🏃‍♂️' : '🚴‍♂️'
            }</span>
            <span id="distance" class="workout__value">${
              workout.distance
            }</span>
            <span class="workout__unit">km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⏱</span>
            <span id="duration" class="workout__value">${
              workout.duration
            }</span>
            <span class="workout__unit">min</span>
          </div>
    `;
    //append the rest of the running html if the workout type is running. we use toFixed because workout.pace is calculated by JS so it might be a weird decimal
    if (workout.type === 'running')
      html += `
    <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span id="pace" class="workout__value">${workout.pace.toFixed(
              1
            )}</span> 
            <span class="workout__unit">min/km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">🦶🏼</span>
            <span id="cadence" class="workout__value">${workout.cadence}</span>
            <span class="workout__unit">spm</span>
          </div>
        </li>`;
    if (workout.type === 'cycling')
      html += `
    <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span id="speed" class="workout__value">${workout.speed.toFixed(
              1
            )}</span>
            <span class="workout__unit">km/h</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⛰</span>
            <span id="elevation" class="workout__value">${
              workout.elevationGain
            }</span>
            <span class="workout__unit">m</span>
          </div>
        </li>`;

    //add to the end of the form element because adding it to the ul element doesn't make sense
    form.insertAdjacentHTML('afterend', html);
  }

  async _geoCode(coords) {
    try {
      // Geolocation. don't need to manually handle any errors here because the promise is immediately rejected if the position can't be found
      // const pos = await this._getCurrentPosition();
      // const { latitude: lat, longitude: lng } = pos.coords;
      // Reverse Geocoding need to manually handle errors here because there are cases where the fetch doesn't reject
      const resGeo = await fetch(
        `https://geocode.maps.co/reverse?lat=${coords[0]}&lon=${coords[1]}`
      );
      if (!resGeo.ok) throw new Error('Problem getting location data');
      const dataGeo = await resGeo.json();

      return dataGeo.address;
    } catch (err) {
      console.error(`${err} 💥`);

      // Reject promise returned from the async function. you need to rethrow the error because sometimes one of the awaits will fail but the promise of the async function will still be fufilled. rethrowing the error will propagate it down to the catch block of the promise consumption. we manually reject the promise returned by the async function
      throw err;
    }
  }

  //determines the action to be taken based on where the workout container was clicked
  _containerAction(e) {
    const workoutEl = e.target.closest('.workout');
    const targetClassList = this._getEventClassList(e);
    this._moveToPopup(workoutEl);
    //if the target was the edit element, run _editWorkout
    if (
      targetClassList.find(className => className === 'workout__action--edit')
    )
      this._editWorkout(workoutEl);

    //if the target was the delete button, run _deleteWorkout
    if (
      targetClassList.find(className => className === 'workout__action--delete')
    )
      this._deleteWorkout(workoutEl);
  }

  //determines the action to be taken based on where the sidebar was clicked
  _sidebarAction(e) {
    const btnEl = e.target.closest('.btn');
    const sortByDropdown = document.querySelector('.sort--by__dropdown');

    if (!btnEl) return;
    const btnClassList = this._getElementClassList(btnEl);

    if (btnClassList.find(className => className === 'show--all--workouts')) {
      this._showAllWorkouts();
    }

    if (btnClassList.find(className => className === 'delete--all--workouts')) {
      this.reset();
    }

    if (btnClassList.find(className => className === 'sort--by')) {
      sortByDropdown.classList.toggle('show');
    }

    if (btnClassList.find(className => className === 'sort--by__option')) {
      switch (btnEl.id) {
        case 'distance':
          this._sortWorkoutDistance(btnEl.id);
          break;
        case 'duration':
          this._sortWorkoutDuration(btnEl.id);
          break;
      }
    }
  }

  _editWorkout(workoutEl) {
    if (!workoutEl) return;
    //render the save button
    this._renderSaveButton(workoutEl);

    //select the workout HTML properties
    const distance = workoutEl.querySelector('#distance');
    const duration = workoutEl.querySelector('#duration');
    const cadence = workoutEl.querySelector('#cadence');
    const elevation = workoutEl.querySelector('#elevation');

    //get the elements classlist for later use in determining which
    const elementClassList = this._getElementClassList(workoutEl);

    //create the input HTMLs
    const editDistanceHTML = `<div class="form__row dynamic-input">
    <input id="editDistance" class="form__input form__input--distance" value="${distance.innerHTML}"/>
    </div>`;
    const editDurationHTML = `<div class="form__row dynamic-input">
    <input id="editDuration" class="form__input form__input--duration" value="${duration.innerHTML}"/>
    </div>`;

    //change the HTMLs to the inputs
    distance.outerHTML = editDistanceHTML;
    duration.outerHTML = editDurationHTML;

    //determine the type of workout and change the proptery specific to that workout
    if (elementClassList.find(className => className === 'workout--running')) {
      const editCadenceHTML = `<div class="form__row dynamic-input">
      <input
        id="editCadence"
        class="form__input form__input--cadence"
        value="${cadence.innerHTML}"
      />
      </div>`;

      cadence.outerHTML = editCadenceHTML;
    }

    if (elementClassList.find(className => className === 'workout--cycling')) {
      const editElevationHTML = `<div class="form__row dynamic-input">
      <input
        id="editElevation"
        class="form__input form__input--elevation"
        value="${elevation.innerHTML}"
      />
      </div>`;

      elevation.outerHTML = editElevationHTML;
    }

    //focus the distance field
    const updatedDistance = workoutEl.querySelector('#editDistance');
    updatedDistance.focus();
  }

  _sortWorkoutDistance() {
    if (!this.#workouts) return;
    const workouts = Array.from(document.querySelectorAll('.workout'));
    workouts.forEach(work => (work.outerHTML = ''));
    this.#workouts.sort((a, b) => a.distance - b.distance);
    this.#workouts.forEach(work => {
      this._renderWorkout(work);
    });
  }

  _sortWorkoutDuration() {
    if (!this.#workouts) return;
    const workouts = Array.from(document.querySelectorAll('.workout'));
    workouts.forEach(work => (work.outerHTML = ''));
    this.#workouts.sort((a, b) => a.duration - b.duration);
    this.#workouts.forEach(work => {
      this._renderWorkout(work);
    });
  }

  _renderSaveButton(workoutEl) {
    const editBtn = workoutEl.querySelector('.workout__action--edit');
    const saveBtn = workoutEl.querySelector('.workout__action--save');
    const deleteBtn = workoutEl.querySelector('.workout__action--delete');

    editBtn.classList.add('hidden');
    saveBtn.classList.remove('hidden');
    saveBtn.style.transform = 'translateX(-5rem)';
    deleteBtn.style.transform = 'translateX(4.5rem)';

    //when clicked, update the workout
    saveBtn.addEventListener('click', this._updateWorkout.bind(this));
  }

  _updateWorkout(e) {
    const workoutEl = e.target.closest('.workout');
    //get the workout from the workout array
    const workout = this._getWorkout(workoutEl, this.#workouts);

    //rebuild the HTML header bc we have to rebuild the workout component
    const headerHTML = `<h2 class="workout__title">${workout.description}
    <div class="workout__actions">
      <button class="workout__action workout__action--edit">Edit</button>
      <button class="workout__action workout__action--delete">Delete</button>
      <button class="workout__action workout__action--save hidden">Save</button>
    </div>
    </h2>`;

    //select the input elements
    const distance = workoutEl.querySelector('#editDistance');
    const duration = workoutEl.querySelector('#editDuration');
    //select the values from the input elements
    const distanceVal = Number(distance.value);
    const durationVal = Number(duration.value);

    if (workout.type === 'running') {
      //if workout type is running then select the cadence value
      const cadence = workoutEl.querySelector('#editCadence');
      const cadenceVal = Number(cadence.value);
      if (
        !this._validInputs(distanceVal, durationVal, cadenceVal) ||
        !this._allPositive(distanceVal, durationVal, cadenceVal)
      )
        return this._displayError();

      //update the workout properties
      workout.distance = distanceVal;
      workout.duration = durationVal;
      workout.cadence = cadenceVal;
      workout.pace = durationVal / distanceVal;

      //rebuild the workout html
      let html = `<div class="workout__details">
        <span class="workout__icon">${
          workout.type === 'running' ? '🏃‍♂️' : '🚴‍♂️'
        }</span>
        <span id="distance" class="workout__value">${workout.distance}</span>
        <span class="workout__unit">km</span>
      </div>
      <div class="workout__details">
        <span class="workout__icon">⏱</span>
        <span id="duration" class="workout__value">${workout.duration}</span>
        <span class="workout__unit">min</span>
      </div>
      <div class="workout__details">
        <span class="workout__icon">⚡️</span>
        <span id="pace" class="workout__value">${workout.pace.toFixed(
          1
        )}</span> 
        <span class="workout__unit">min/km</span>
      </div>
      <div class="workout__details">
        <span class="workout__icon">🦶🏼</span>
        <span id="cadence" class="workout__value">${workout.cadence}</span>
        <span class="workout__unit">spm</span>
      </div>
        </li>`;

      workoutEl.innerHTML = headerHTML + html;

      //update local storage
      this._setLocalStorage();
    } else {
      //if workout type is cycling then select the elevation value
      const elevation = workoutEl.querySelector('#editElevation');
      const elevationVal = Number(elevation.value);

      if (
        !this._validInputs(distanceVal, durationVal, elevationVal) ||
        !this._allPositive(distanceVal, durationVal)
      )
        return this._displayError();

      //update the workout properties
      workout.distance = distanceVal;
      workout.duration = durationVal;
      workout.elevation = elevationVal;
      workout.speed = distanceVal / (durationVal / 60);

      //rebuild the workout html
      let html = `
        <div class="workout__details">
          <span class="workout__icon">${
            workout.type === 'running' ? '🏃‍♂️' : '🚴‍♂️'
          }</span>
          <span id="distance" class="workout__value">${workout.distance}</span>
          <span class="workout__unit">km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⏱</span>
          <span id="duration" class="workout__value">${workout.duration}</span>
          <span class="workout__unit">min</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span id="speed" class="workout__value">${workout.speed.toFixed(
            1
          )}</span>
          <span class="workout__unit">km/h</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⛰</span>
          <span id="elevation" class="workout__value">${
            workout.elevationGain
          }</span>
          <span class="workout__unit">m</span>
        </div>
      </li>`;

      workoutEl.innerHTML = headerHTML + html;

      //update local storage
      this._setLocalStorage();
    }
  }

  _deleteWorkout(workoutEl) {
    //fade out the workout HTML element
    workoutEl.classList.add('fade-out');
    setTimeout(() => {
      workoutEl.outerHTML = '';
    }, 500);

    const workoutObjToDelete = this._getWorkout(workoutEl, this.#workouts);
    //delete the workout from localStorage
    const workoutToDelete = this.#workouts.findIndex(
      work => work.id === workoutEl.dataset.id
    );
    this._deleteWorkoutMarker(workoutObjToDelete);
    this.#workouts.splice(workoutToDelete, 1);
    this._setLocalStorage();
    this.#map.removeLayer();
  }
  //we need the event here to match the element we are looking for. it's important to select the workout class because that's where the workout id is. the workout id is the bridge between the UI and the app data
  _moveToPopup(workoutEl) {
    //using event bubbling to select workout

    //guard clause if no workout exists as the parent of the target
    if (!workoutEl) return;

    const workout = this._getWorkout(workoutEl, this.#workouts);

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      duration: 1,
      // pan: {
      //   duration: 1,
      // },
    });

    //use the public interface
    workout.click();
  }

  _showAllWorkouts() {
    console.log(this.#markers);
    const markers = [];

    this.#markers.forEach(marker => markers.push(marker[2]));

    const markerGroup = new L.featureGroup(markers);

    this.#map.fitBounds(markerGroup.getBounds());
  }

  //this is an API the browser provides. localStorage is a key value store. don't use localStorage to store large amounts of data. another reason to not use this is, it also is "blocking"
  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  //objects coming from localStorage break their prototypal chain. so we can't use the workout.click function on retrieved workouts. we will comment that out
  _getLocalStorage() {
    const workouts = [];
    const data = JSON.parse(localStorage.getItem('workouts'));

    //check if there's actually data
    if (!data) return;

    //rebuild the running and cycling objects from local storage. this way we can use public methods on them (workout.click)
    data.forEach(work => {
      if (work.type === 'running') {
        const workObj = new Running(
          work.coords,
          work.distance,
          work.duration,
          work.cadence
        );

        workObj.date = work.date;
        workObj.id = work.id;
        workObj.description = `${work.type[0].toUpperCase()}${work.type.slice(
          1
        )} on ${
          months[this._getMonthNumber(workObj.date)]
        } ${this._getDayNumber(workObj.date)}`;
        workouts.push(workObj);
      } else {
        const workObj = new Cycling(
          work.coords,
          work.distance,
          work.duration,
          work.elevationGain
        );

        workObj.date = work.date;
        workObj.id = work.id;
        //we have to set the description like this because when the object is rebuilt it automatically uses the date generated from the workout prototype
        workObj.description = `${work.type[0].toUpperCase()}${work.type.slice(
          1
        )} on ${
          months[this._getMonthNumber(workObj.date)]
        } ${this._getDayNumber(workObj.date)}`;
        workouts.push(workObj);
      }
    });

    console.log(workouts);
    this.#workouts = workouts;

    this.#workouts.forEach(work => {
      this._renderWorkout(work);
      //this._renderWorkoutMarker(work); this won't work bc _getLocalStorage is called at the beginning. but the map hasn't been fully loaded yet so it'll throw an error because there is no map to render the workout on. this is the beginning of our journey into async. for this to work, we'll have to call it after the map has loaded
    });
  }

  _displayError() {
    errorModal.style.display = 'block';

    setTimeout(this._hideError, 5000);
  }

  _hideError() {
    errorModal.classList.add('fade-out');

    //let the fade out animation run before removing and changing the css
    setTimeout(() => {
      errorModal.style.display = 'none';
      errorModal.classList.remove('fade-out');
    }, 1000);
  }

  //helper functions
  _getEventClassList(e) {
    return Array.prototype.slice.call(e.target.classList, 0);
  }

  _getElementClassList(el) {
    return Array.prototype.slice.call(el.classList, 0);
  }

  _getWorkout(workoutEl, workouts) {
    const workout = workouts.find(work => work.id === workoutEl.dataset.id);

    return workout;
  }

  _getMarker(workout) {
    const markerToDelete = this.#markers.find(
      mark => mark[0] === workout.coords[0] && mark[1] === workout.coords[1]
    );

    const markerIndexToDelete = this.#markers.findIndex(
      mark => mark[0] === workout.coords[0] && mark[1] === workout.coords[1]
    );

    this.#markers.splice(markerIndexToDelete, 1);

    return markerToDelete[2];
  }

  _validInputs = (...inputs) => inputs.every(inp => Number.isFinite(inp));
  //returns true if every number in the inputs array is a finite number

  _allPositive = (...inputs) => inputs.every(inp => inp > 0);

  _getMonthNumber(dateString) {
    // Create a new Date object from the input string
    const date = new Date(dateString);

    // Get the month number (0-11) and add 1 to get the usual format (1-12)
    let month = date.getMonth();

    return month;
  }

  _getDayNumber(dateString) {
    // Create a new Date object from the input string
    const date = new Date(dateString);

    // Get the day number and add 1 to get the usual format (1-12)
    let day = date.getDate();

    return day;
  }

  //make a public method so we can use it outside the app or in the console
  reset() {
    localStorage.removeItem('workouts');
    location.reload(); //location is a big object that contains a lot of browser methods and properties
  }
}

const app = new App();
