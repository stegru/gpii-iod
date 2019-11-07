/*
 * IoD package data source tests.
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

var os = require("os"),
    fs = require("fs"),
    path = require("path"),
    rimraf = require("rimraf");

var fluid = require("infusion");
var kettle = fluid.require("kettle");
kettle.loadTestingSupport();

var jqUnit = fluid.require("node-jqunit");
var gpii = fluid.registerNamespace("gpii");

fluid.registerNamespace("gpii.tests.iod.packageData");

require("../index.js");

var teardowns = [];

jqUnit.module("gpii.tests.iod.packageData", {
    teardown: function () {
        while (teardowns.length) {
            teardowns.pop()();
        }
    }
});

gpii.tests.iod.packageData.testKey = fluid.freezeRecursive({
    passphrase: "test",
    // Private key - generated with: openssl genrsa -out test-private.pem -aes128 -passout pass:test 4096
    key: fs.readFileSync(path.join(__dirname, "test-private.pem"), "ascii"),
    // Public key - generated with: openssl rsa -in test-private.pem -pubout -out test-public.pem
    publicKey: fs.readFileSync(path.join(__dirname, "test-public.pem"), "ascii")
});


jqUnit.asyncTest("loadPackages, addPackage, getPackage", function () {

    var tempDir = path.join(os.tmpdir(), "gpii-test-packages" + Math.random());
    teardowns.push(function () {
        rimraf.sync(tempDir);
    });

    fs.mkdirSync(tempDir);
    // test reading an empty sub directory
    fs.mkdirSync(path.join(tempDir, "empty"));

    // Create a few simple packages
    var packagePromises = [];
    var expectedPackages = [];

    for (var n = 0; n < 15; n++) {
        var name = "test-package" + n;

        // Put some in subdirectories
        var dir = (n % 2) ? tempDir : path.join(tempDir, n.toString()[0]);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        var file = path.join(dir, name + ".morphic-package");
        var bad = n % 3 === 0;
        if (bad) {
            // Create some bad files to check they get ignored and nothing explodes.
            fs.writeFileSync(file, "bad package:" + name);
        } else {
            expectedPackages.push(name);
            packagePromises.push(gpii.iod.packageFile.create({
                name: name
            }, null, gpii.tests.iod.packageData.testKey, file));
        }
    }

    jqUnit.expect(3 * expectedPackages.length + 2);

    fluid.promise.sequence(packagePromises).then(function () {
        // Test data has been created - try to load it.
        var packageDataSource = gpii.iod.packageDataSource({packageDirectory: tempDir});
        packageDataSource.loadPackages().then(function () {
            var packageNames = Object.keys(packageDataSource.packages);

            jqUnit.assertDeepEq("All packages should have been loaded", expectedPackages.sort(), packageNames.sort());

            fluid.each(packageDataSource.packages, function (packageFileInfo, name) {
                jqUnit.assertEquals("Loaded package should be correctly identified", name,
                    packageFileInfo.packageData.name);
            });

            // Test getPackage on the packages
            var getPackages = fluid.transform(expectedPackages, function (name) {
                return function () {
                    return packageDataSource.getImpl({packageName: name}).then(function (packageFileInfo) {
                        jqUnit.assertTrue("getImpl should resolve with something", packageFileInfo);
                        jqUnit.assertEquals("getImpl should resolve with the correct package",
                            name, packageFileInfo.packageData.name);
                    });
                };
            });

            // Try a non-existing package
            getPackages.push(packageDataSource.getImpl({packageName: "non-existing-package"}).then(function (packageFileInfo) {
                jqUnit.assertEquals("getImpl should return undefined for an unknown package",
                    undefined, packageFileInfo);
            }));

            fluid.promise.sequence(getPackages).then(jqUnit.start, jqUnit.fail);
        });
    });

});
