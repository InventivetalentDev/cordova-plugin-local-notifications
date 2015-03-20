/*
    Copyright 2013-2015 appPlant UG

    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

exports = require('de.appplant.cordova.plugin.local-notification.LocalNotification.Proxy.Core').core;


/***********
 * MEMBERS *
 ***********/

// True if App is running, false if suspended
exports.isInBackground = true;

// Indicates if the device is ready (to receive events)
exports.isReady = false;

// Queues all events before deviceready
exports.eventQueue = [];

/********
 * UTIL *
 ********/

/**
 * The repeating interval in milliseconds.
 *
 * @param {String} interval
 *      A number or a placeholder like `minute`.
 *
 * @return {Number}
 *      Interval in milliseconds
 */
exports.getRepeatInterval = function (every) {

    if (!every)
        return 0;

    if (every == 'minute')
        return 60000;

    if (every == 'hour')
        return 360000;

    if (!NaN(every))
        return parseInt(every) * 60000;

    return 0;
};

/**
 * Parses sound file path.
 *
 * @param {String} path
 *      Relative path to sound resource
 *
 * @return {String} URI to Sound-File
 */
exports.parseSound = function (path) {
    var pkg = Windows.ApplicationModel.Package.current,
        pkgId = pkg.id,
        pkgName = pkgId.name;

    if (!path.match(/^file/))
        return;

    var sound = "'ms-appx://" + pkgName + "/www/" + path.slice(6, path.length) + "'",
        audio = "<audio src=" + sound + " loop='false'/>";

    return audio;
};

/**
 * Builds the xml payload for a local notification based on its options.
 *
 * @param {Object} options
 *      Local notification properties
 *
 * @return {String}
 *      Windows.Data.Xml.Dom.XmlDocument
 */
exports.build = function (options) {
    var title = options.title,
        message = options.text || '',
        sound = '';

    if (!title || title === '') {
        title = 'Notification';
    }

    if (options.sound) {
        sound = this.parseSound(options.sound);
    }

    var payload =
        "<toast> " +
            "<visual version='2'>" +
                "<binding template='ToastText02'>" +
                    "<text id='2'>" + message + "</text>" +
                    "<text id='1'>" + title + "</text>" +
                "</binding>" +
            "</visual>" +
            sound +
            "<json>" + JSON.stringify(options) + "</json>" +
        "</toast>";

    var notification = new Windows.Data.Xml.Dom.XmlDocument();

    try {
        notification.loadXml(payload);
    } catch (e) {
        console.error(
            'LocalNotification#schedule',
            'Error loading the xml, check for invalid characters.');
    }

    // Launch Attribute to enable onClick event
    var launchAttr = notification.createAttribute('launch'),
        toastNode = notification.selectSingleNode('/toast');

    launchAttr.value = options.id.toString();
    toastNode.attributes.setNamedItem(launchAttr);

    return notification;
};

/**
 * Short-hand method for the toast notification history.
 */
exports.getToastHistory = function () {
    return Windows.UI.Notifications.ToastNotificationManager.history;
};

/**
 * Gets a toast notifier instance.
 *
 * @return Object
 */
exports.getToastNotifier = function () {
    return Windows.UI.Notifications.ToastNotificationManager
            .createToastNotifier();
};

/**
 * List of all scheduled toast notifiers.
 *
 * @return Array
 */
exports.getScheduledToasts = function () {
    return this.getToastNotifier().getScheduledToastNotifications();
};

/**
 * Gets the Id from the toast notifier.
 *
 * @param {Object} toast
 *      A toast notifier object
 *
 * @return String
 */
exports.getToastId = function (toast) {
    var id = toast.id;

    if (id.match(/-2$/))
        return id.match(/^[^-]+/)[0];

    return id;
};

/**
 * Gets the notification life cycle type
 * (scheduled or triggered)
 *
 * @param {Object} toast
 *      A toast notifier object
 *
 * @return String
 */
exports.getToastType = function (toast) {
    return this.isToastTriggered(toast) ? 'triggered' : 'scheduled';
};

/**
 * If the toast is already scheduled.
 *
 * @param {Object} toast
 *      A toast notifier object
 *
 * @return Boolean
 */
exports.isToastScheduled = function (toast) {
    return !this.isToastTriggered(toast);
};

/**
 * If the toast is already triggered.
 *
 * @param {Object} toast
 *      A toast notifier object
 *
 * @return Boolean
 */
exports.isToastTriggered = function (toast) {
    var id = this.getToastId(toast),
        notification = this.getAll(id)[0];
        fireDate = new Date((notification.at) * 1000);

    return fireDate <= new Date();
};

/**
 * Finds the toast by it's ID.
 *
 * @param {String} id
 *      Local notification ID
 *
 * @param Object
 */
exports.findToastById = function (id) {
    var toasts = this.getScheduledToasts();

    for (var i = 0; i < toasts.length; i++) {
        var toast = toasts[i];

        if (this.getToastId(toast) == id)
            return toast;
    }

    return null;
};

/**
 * Sets trigger event for local notification.
 *
 * @param {Object} notification
 *      Local notification object
 * @param {Function} callback
 *      Callback function
 */
exports.callOnTrigger = function (notification, callback) {
    var triggerTime = new Date((notification.at * 1000)),
        interval = triggerTime - new Date();

    if (interval <= 0) {
        callback.call(this, notification);
        return;
    }

    WinJS.Promise.timeout(interval).then(function () {
        if (exports.isPresent(notification.id)) {
            callback.call(exports, notification);
        }
    });
};

/**
 * The application state - background or foreground.
 *
 * @return String
 */
exports.getApplicationState = function () {
    return this.isInBackground ? 'background' : 'foreground';
};

/**
 * Fires the event about a local notification.
 *
 * @param {String} event
 *      The event
 * @param {Object} notification
 *      The notification
 */
exports.fireEvent = function (event, notification) {
    var plugin = cordova.plugins.notification.local.core,
        state = this.getApplicationState(),
        args;

    if (notification) {
        args = [event, notification, state];
    } else {
        args = [event, state];
    }

    if (this.isReady) {
        plugin.fireEvent.apply(plugin, args);
    } else {
        this.eventQueue.push(args);
    }
};


/**************
 * LIFE CYCLE *
 **************/

// App is running in background
document.addEventListener('pause', function () {
    exports.isInBackground = true;
}, false);

// App is running in foreground
document.addEventListener('resume', function () {
    exports.isInBackground = false;
}, false);

// App is running in foreground
document.addEventListener('deviceready', function () {
    exports.isInBackground = false;
}, false);

// Handle onclick event
WinJS.Application.addEventListener('activated', function (args) {
    var id = args.detail.arguments,
        notification = exports.getAll([id])[0];

    if (!notification)
        return;

    exports.clearLocalNotification(id);
    exports.fireEvent('click', notification);
}, false);
