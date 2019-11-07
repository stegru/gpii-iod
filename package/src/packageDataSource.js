/*
 * IoD package data source.
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

var fs = require("fs"),
    path = require("path");

var gpii = fluid.registerNamespace("gpii");
fluid.registerNamespace("gpii.iod.packageData");

fluid.defaults("gpii.iod.packageDataSource", {
    gradeNames: ["kettle.dataSource"],
    readOnlyGrade: "gpii.iod.packageDataSource",

    invokers: {
        getImpl: {
            func: "{that}.getPackageFile",
            args: ["{arguments}.1.packageName"]
        },
        getPackageFile: {
            funcName: "gpii.iod.packageData.getPackageFile",
            args: ["{that}", "{arguments}.0"] // packageName
        },
        addPackageFile: {
            funcName: "gpii.iod.packageData.addPackageFile",
            args: ["{that}", "{arguments}.0"] // packageFile
        },
        loadPackages: {
            funcName: "gpii.iod.packageData.loadPackages",
            args: ["{that}", "{that}.options.packageDirectory"]
        }
    },

    listeners: {
        "onCreate.loadPackages": "{that}.loadPackages()",
        "onRead.encoding": "fluid.identity" // no need to decode the response, it's already an object.
    },

    // Set in config.
    packageDirectory: undefined,

    members: {
        /** @type Map<PackageFileInfo> */
        packages: {}
    }
});

/**
 * Gets a package file, using the name of the package.
 *
 * @param {Component} that The gpii.iod.packageDataSource instance.
 * @param {String} packageName The name of the package.
 * @return {Promise<PackageFileInfo>} Resolves with the package file info.
 */
gpii.iod.packageData.getPackageFile = function (that, packageName) {
    return fluid.toPromise(that.packages[packageName]);
};

/**
 * Adds a file to the list of loaded packages.
 *
 * @param {Component} that The gpii.iod.packageDataSource instance.
 * @param {String} packageFile The package file to add.
 * @return {Promise} Resolves when the package file has been read.
 */
gpii.iod.packageData.addPackageFile = function (that, packageFile) {
    fluid.log("Loading package file: " + packageFile);
    return gpii.iod.packageFile.read(packageFile).then(function (packageFileInfo) {
        that.packages[packageFileInfo.packageData.name] = packageFileInfo;
    });
};

/**
 * Loads all package files from a directory (and subdirectories).
 *
 * @param {Component} that The gpii.iod.packageDataSource instance.
 * @param {String} packageDirectory The directory containing the package files.
 * @return {Promise<Array<Error>>} Resolves with an array of errors when all files have been loaded.
 */
gpii.iod.packageData.loadPackages = function (that, packageDirectory) {
    var promise = fluid.promise();

    packageDirectory = fluid.module.resolvePath(packageDirectory);
    fluid.log("Loading package files from " + packageDirectory);

    var beforeCount = Object.keys(that.packages).length;

    fs.readdir(packageDirectory, function (err, files) {
        var index = 0;
        var result = [];
        // An async ".each"
        var addNext = function () {
            if (index >= files.length) {
                promise.resolve(result);
            } else {
                var file = path.join(packageDirectory, files[index++]);
                fs.stat(file, function (err, stats) {
                    var addPromise;
                    if (err) {
                        // Add the error to the list.
                        addPromise = fluid.promise().reject({
                            isError: true,
                            filename: file,
                            message: err.message || err,
                            error: err
                        });
                    } else if (stats.isDirectory()) {
                        // Load the subdirectory.
                        addPromise = gpii.iod.packageData.loadPackages(that, file).then(function (value) {
                            result.push.apply(result, value);
                        });
                    } else {
                        addPromise = that.addPackageFile(file);
                    }

                    addPromise.then(addNext, function (err) {
                        fluid.log("Error loading package " + file + ": ", err);
                        err.filename = file;
                        result.push(err);
                        addNext();
                    });
                });
            }
        };

        if (err) {
            promise.reject({
                isError: true,
                message: "Error loading packages from " + packageDirectory + ": " + (err.message || err),
                err: err
            });
        } else {
            addNext();
        }
    });

    return promise.then(function (result) {
        var failed = result.length ? (" (" + result.length + " failed)") : "";
        var total = Object.keys(that.packages).length;
        var loaded = total - beforeCount;
        fluid.log("Loaded " + loaded + " packages" + failed + " - total packages: " + total);
    });
};
