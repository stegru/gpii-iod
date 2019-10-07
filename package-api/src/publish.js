/*
 * IoD packages external API.
 *
 * Copyright 2018 Raising the Floor - International
 *
 * Licensed under the New BSD license. You may not use this file except in
 * compliance with this License.
 *
 * The R&D leading to these results received funding from the
 * Department of Education - Grant H421A150005 (GPII-APCP). However,
 * these results do not necessarily represent the policy of the
 * Department of Education, and you should not assume endorsement by the
 * Federal Government.
 *
 * You may obtain a copy of the License at
 * https://github.com/GPII/universal/blob/master/LICENSE.txt
 */

"use strict";

var fluid = fluid || require("infusion");
var iod = fluid.registerNamespace("gpii.iod");

var child_process = require("child_process"),
    os = require("os");


fluid.defaults("gpii.iod.packages.publish", {
    gradeNames: "fluid.component",
    listeners: {
        "{iodServer}.events.onListen": "{that}.publishService",
        "onDestroy": "{that}.unpublishService"
    },
    invokers: {
        publishService: {
            funcName: "gpii.iod.packages.publishService",
            args: [ "{that}", "{iodServer}.options.port"]
        },
        unpublishService: {
            funcName: "gpii.iod.packages.unpublishService",
            args: [ "{that}", "{packages}"]
        }
    },
    members: {
        avahiChild: null
    }
});

/**
 * Publish the IoD service for clients to know how to connect.
 *
 * @param {Component} that The iod.packages.publish instance.
 * @param {number} port The tcp port on which the service is listening. The environment variable GPII_IOD_PORT will
 * override this (like for when external connectivity is provided by nginx).
 * @param {string} url [optional] The url for the service.
 */
iod.packages.publishService = function (that, port, url) {
    if (process.env.GPII_IOD_PORT) {
        port = process.env.GPII_IOD_PORT;
    } else if (port && port.port) {
        port = port.port;
    }

    url = url || process.env.GPII_IOD_URL;

    var serviceName = "GPII IoD Service";
    var serviceType = "_gpii-iod._tcp";

    var args = [ "--service", serviceName, serviceType, port ];

    if (!url) {
        url = "http://" + os.hostname() + ":" + port;
    }

    args.push("url=" + url);

    that.avahiChild = child_process.execFile("avahi-publish", args);
    that.avahiChild.on("error", function (err) {
        fluid.log("avahi:", err);
    });
    that.avahiChild.on("exit", function () {
        that.avahiChild = null;
    });
};

/**
 * Stop publishing the IoD service.
 *
 * @param {Component} that The iod.packages.publish instance.
 */
iod.packages.unpublishService = function (that) {
    if (that.avahiChild) {
        that.avahiChild.kill();
        that.avahiChild = null;
    }
};
