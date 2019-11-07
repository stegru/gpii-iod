/*
 * IoD packages external API.
 *
 * Copyright 2019 Raising the Floor - International
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

var fs = require("fs");
require("kettle");

var gpii = fluid.registerNamespace("gpii");
fluid.registerNamespace("gpii.iod");

/**
 * @typedef PackageResponse {Object}
 * @property {String} packageData The package data (as a JSON string)
 * @property {String} packageDataSignature The signature of the packageData (base64 encoded)
 * @property {Boolean} installer true if there's an installer file available.
 */

fluid.defaults("gpii.iod.packageServer", {
    gradeNames: "kettle.app",
    serverUrl: "http://localhost",

    requestHandlers: {
        packages: {
            route: "/packages/:packageName",
            method: "get",
            type: "gpii.iod.packageServer.packagesRequest"
        },
        installer: {
            route: "/installer/:packageName",
            method: "get",
            type: "gpii.iod.packageServer.installerRequest"
        }
    },
    components: {
        "packageDataSource": {
            type: "gpii.iod.packageDataSource",
            options: {
                "readOnlyGrade": "gpii.iod.packageDataSource"
            }
        }
    }
});

fluid.defaults("gpii.iod.packageServer.packagesRequest", {
    gradeNames: ["kettle.request.http"],
    invokers: {
        handleRequest: {
            funcName: "gpii.iod.packageServer.handleRequest",
            args: [
                "{packageServer}", "{request}", "{request}.req.params.packageName", "{request}.req.params.lang"
            ]
        }
    }
});

fluid.defaults("gpii.iod.packageServer.installerRequest", {
    gradeNames: ["kettle.request.http"],
    invokers: {
        handleRequest: {
            funcName: "gpii.iod.packageServer.getInstaller",
            args: [
                "{packageServer}", "{request}", "{request}.req.params.packageName", "{request}.req.params.lang"
            ]
        }
    }
});

/**
 * Handles /packages requests. Responds with a {PackageResponse} for the given package.
 *
 * @param {Component} packages The gpii.iod.packageServer instance.
 * @param {Component} request The gpii.iod.packageServer.packagesRequest for this request.
 * @param {String} packageName Name of the requested package.
 */
gpii.iod.packageServer.handleRequest = function (packages, request, packageName) {
    fluid.log("package requested: " + packageName);
    packages.packageDataSource.get({packageName: packageName}).then(function (packageInfo) {
        /** @type PackageResponse */
        var result = {
            packageData: packageInfo.packageDataJson,
            packageDataSignature: packageInfo.signature.toString("base64")
        };
        if (packageInfo.header.installerLength) {
            result.installer = "/installer/" + packageName;
        }
        request.events.onSuccess.fire(result);
    }, function (err) {
        fluid.log(err);

        request.events.onError.fire({
            message: "No such package",
            statusCode: err.statusCode || 404
        });
    });
};

/**
 * Handles /installer requests. Responds with the installer binary, for the given package.
 *
 * @param {Component} packages The gpii.iod.packageServer instance.
 * @param {Component} request The gpii.iod.packageServer.installerRequest for this request.
 * @param {String} packageName Name of the requested package.
 */
gpii.iod.packageServer.getInstaller = function (packages, request, packageName) {
    fluid.log("installer requested: " + packageName);
    packages.packageDataSource.get({packageName: packageName}).then(function (packageInfo) {

        if (packageInfo.header.installerLength) {
            // Open the package file, and seek to the installer offset.
            var installerStream = fs.createReadStream(packageInfo.path, {
                start: packageInfo.header.installerOffset,
                end: packageInfo.header.installerOffset + packageInfo.header.installerLength
            });

            request.res.status(200).setHeader("Content-Type", "application/octet-stream");
            installerStream.pipe(request.res);
            installerStream.on("end", request.events.onSuccess.fire);
        } else {
            request.events.onError.fire({
                message: "No installer for this package",
                statusCode: 404
            });
        }
    }, function (err) {
        fluid.log(err);

        request.events.onError.fire({
            message: "No such package",
            statusCode: 404
        });
    });
};
