/*
 * IoD package file Tests.
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

var os = require("os"),
    crypto = require("crypto"),
    fs = require("fs"),
    path = require("path");

var fluid = require("infusion");
var kettle = fluid.require("kettle");
kettle.loadTestingSupport();

var jqUnit = fluid.require("node-jqunit");
var gpii = fluid.registerNamespace("gpii");

fluid.registerNamespace("gpii.tests.iod.packageFile");

require("../src/packageFile.js");

var teardowns = [];
var tempFiles = [];
jqUnit.module("gpii.tests.iod.packageFile", {
    teardown: function () {
        while (teardowns.length) {
            teardowns.pop()();
        }
        fluid.each(tempFiles, function (file) {
            try {
                fs.unlinkSync(file);
            } catch (e) {
                // ignore
            }
        });
    }
});

gpii.tests.iod.packageFile.testKey = fluid.freezeRecursive({
    passphrase: "test",
    // Private key - generated with: openssl genrsa -out test-private.pem -aes128 -passout pass:test 4096
    key: fs.readFileSync(path.join(__dirname, "test-private.pem"), "ascii"),
    // Public key - generated with: openssl rsa -in test-private.pem -pubout -out test-public.pem
    publicKey: fs.readFileSync(path.join(__dirname, "test-public.pem"), "ascii")
});

gpii.tests.iod.packageFile.testData = fluid.freezeRecursive({
    // md5 sum of gpii.tests.iod.packageFile.testKey.publicKey
    // grep -v '^----' test-public.pem | base64 -d | md5sum
    publicKeyMD5: "b8d0ce34e218bad294f4c4fa5bacf915",

    packageData: {
        test: "example"
        // publicKey is added during signing.
    },

    // The signature of a packageData (with an additional field identifying the public key)
    // encoded-key: grep -v '^----' test-public.pem | base64 --decode | base64 --wrap 0
    // echo -n '{"test":"example","publicKey":"encoded-key"}' |
    //   openssl dgst -sha512 -sign test-private.pem -out test-signed.rsa
    signature: fs.readFileSync(path.join(__dirname, "test-signed.rsa"))
});

jqUnit.asyncTest("Hash file", function () {

    var tests = [
        {
            data: "test1",
            expect: "b16ed7d24b3ecbd4164dcdad374e08c0ab7518aa07f9d3683f34c2b3c67a15830268cb4a56c1ff6f54c8e54a795f5b87c08668b51f82d0093f7baee7d2981181"
        },
        {
            data: "test2",
            algorithm: "sha512",
            expect: "hash"
        },
        {
            data: "test3",
            algorithm: "sha256",
            expect: "hash"
        },
        {
            data: null,
            algorithm: "not valid",
            expect: "reject"
        },
        {
            data: null,
            algorithm: "sha256",
            expect: "reject"
        },
        {
            data: null,
            expect: "reject"
        }
    ];


    var work = fluid.transform(tests, function (test) {
        return function () {
            var testFile;
            testFile = path.join(os.tmpdir(), "gpii-hashtest" + Math.random());
            tempFiles.push(testFile);

            if (test.data !== null) {
                fs.writeFileSync(testFile, test.data);
            }

            var promise = fluid.promise();
            gpii.iodServer.packageFile.hashFile(testFile, test.algorithm).then(function (result) {
                var expect;
                if (test.expect === "hash") {
                    expect = crypto.createHash(test.algorithm || "sha512")
                        .update(test.data)
                        .digest();
                } else {
                    expect = Buffer.from(test.expect, "hex");
                }

                jqUnit.assertDeepEq("hash should be as expected : " + test.data, expect, result);
            }, function (err) {
                jqUnit.assertEquals("hashFile should reject only if expected : " + test.data, test.expect, "reject");

                if (test.expect !== "reject") {
                    fluid.log(err);
                }
            }).then(promise.resolve, promise.resolve);

            return promise;
        };
    });


    fluid.promise.sequence(work).then(jqUnit.start, jqUnit.fail);



});


jqUnit.test("testing readPEM", function () {
    var tests = {
        "test data": [
            // "test data" base64 encoded
            "-----BEGIN PUBLIC KEY-----\ndGVzdCBkYXRh\n-----END PUBLIC KEY-----",
            "-----BEGIN PUBLIC KEY-----\ndGVz\ndCBk\nYXRh\n-----END PUBLIC KEY-----",
            "aaaaa\n-----BEGIN PUBLIC KEY-----\ndGVzdCBkYXRh\n-----END PUBLIC KEY-----\nzzzzz",
            "aaaaa\n-----BEGIN PUBLIC KEY-----\ndGVz\ndCBk\nYXRh\n-----END PUBLIC KEY-----\nzzzzz",

            "-----BEGIN PUBLIC KEY-----\ndGVzdCBkYXRh\n-----END PUBLIC KEY-----"
            + "\n-----BEGIN PUBLIC KEY-----\ndGVzdCBkYXRh\n-----END PUBLIC KEY-----"
        ],
        "": [
            // empty
            "-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----",
            "-----BEGIN PUBLIC KEY-----\n\n-----END PUBLIC KEY-----",
            "aaaaa\n-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----\nzzzzz",
            "aaaaa\n-----BEGIN PUBLIC KEY-----\n\n\n-----END PUBLIC KEY-----\nzzzzz",
            "-----BEGIN PUBLIC KEY-----\n#\n-----END PUBLIC KEY-----",
            "-----BEGIN PUBLIC KEY-----\nA\n-----END PUBLIC KEY-----"
        ],
        "invalid": [
            "",
            // "test data" base64 encoded, but incorrect header/footer
            "dGVzdCBkYXRh",
            "-----BEGIN PUBLIC KEY-----\ndGVzdCBkYXRh\n",
            "\ndGVzdCBkYXRh\n-----END PUBLIC KEY-----",
            // invalid
            "##",
            "y",
            "-----BEGIN PUBLIC KEY-----\n",
            "-----BEGIN PUBLIC KEY-----dGVzdCBkYXRh-----END PUBLIC KEY-----"
        ]
    };

    fluid.each(tests, function (inputs, expect) {
        fluid.each(inputs, function (input, index) {
            var result = gpii.iodServer.packageFile.readPEM(input);
            var suffix = " - expect=" + expect + ", index=" + index;
            if (expect === "invalid") {
                jqUnit.assertNull("readPEM should return null for invalid data" + suffix, result);
            } else {
                jqUnit.assertTrue("readPEM should return a buffer" + suffix, result instanceof Buffer);

                var resultString = result.toString();
                jqUnit.assertEquals("readPEM should return the expected data" + suffix, expect, resultString);
            }
        });
    });

    // Try a real key
    var result2 = gpii.iodServer.packageFile.readPEM(gpii.tests.iod.packageFile.testKey.publicKey);

    // Rather than hard-code the entire key (or re-implement readPEM here), just verify it with a hash.
    var md5 = crypto.createHash("md5").update(result2).digest("hex");

    jqUnit.assertEquals("readPEM should correctly decode the public key",
        gpii.tests.iod.packageFile.testData.publicKeyMD5, md5);
});

jqUnit.test("Signing Package data", function () {

    var packageData = gpii.tests.iod.packageFile.testData.packageData;

    var signed = gpii.iodServer.packageFile.signPackageData(packageData, gpii.tests.iod.packageFile.testKey);

    // Check the public key has been added to the payload.
    var signedJson = signed.buffer.toString();
    fluid.log("Signed data: '" + signedJson + "'");
    var signedObject = JSON.parse(signedJson);

    // Check the publicKey field
    var expectedKey = gpii.iodServer.packageFile.readPEM(gpii.tests.iod.packageFile.testKey.publicKey);
    var actualKey = Buffer.from(signedObject.publicKey, "base64");

    jqUnit.assertDeepEq("publicKey field in the signed data should be correct",
        expectedKey, actualKey);

    // Make sure the signed object matches the original (except the publicKey field)
    delete signedObject.publicKey;
    jqUnit.assertDeepEq("Signed object should match the original", packageData, signedObject);

    var expectedSig = gpii.tests.iod.packageFile.testData.signature;
    jqUnit.assertDeepEq("signature should match the pre-made signature", expectedSig, signed.signature);
});

gpii.tests.iod.packageFile.createSamplePackage = function (packageFile) {
    return gpii.iodServer.packageFile.create(gpii.tests.iod.packageFile.testData.packageData, null,
        gpii.tests.iod.packageFile.testKey, packageFile);
};

jqUnit.asyncTest("Create a simple package file", function () {

    var packageFile = path.join(os.tmpdir(), "gpii-package" + Math.random());
    tempFiles.push(packageFile);

    gpii.tests.iod.packageFile.createSamplePackage(packageFile).then(function () {

        var data = fs.readFileSync(packageFile);

        var fileId = data.toString("ascii", 0, gpii.iodServer.packageFile.fileIdentity.length);
        jqUnit.assertEquals("Package file should start with the file identifier",
            gpii.iodServer.packageFile.fileIdentity, fileId);

        var offset = gpii.iodServer.packageFile.fileIdentity.length;
        var intSize = 4;

        var packageDataLength = data.readUInt32LE(offset);
        offset += intSize;
        // accuracy of the packageDataLength value is tested by taking the data it points to.

        var signatureLength = data.readUInt32LE(offset);
        offset += intSize;
        jqUnit.assertEquals("signatureLength value should match the actual signature length",
            gpii.tests.iod.packageFile.testData.signature.length, signatureLength);

        var installerLength = data.readUInt32LE(offset);
        offset += intSize;
        jqUnit.assertEquals("installerLength value should be zero (installer wasn't given)", 0, installerLength);

        // Check the size of the file compared to the header values
        var totalSize = gpii.iodServer.packageFile.headerLength + packageDataLength + signatureLength + installerLength;
        var fileStats = fs.statSync(packageFile);
        jqUnit.assertEquals("File size should match what the header suggests", fileStats.size, totalSize);

        // offset should now be after the header
        var packageDataBuffer = data.slice(offset, offset += packageDataLength);

        // decode the package data
        var packageDataJson = packageDataBuffer.toString();
        var packageDataObject = JSON.parse(packageDataJson);

        var expectedKey = gpii.iodServer.packageFile.readPEM(gpii.tests.iod.packageFile.testKey.publicKey);
        var actualKey = Buffer.from(packageDataObject.publicKey, "base64");

        jqUnit.assertDeepEq("package data should contain the publicKey",
            expectedKey, actualKey);

        delete packageDataObject.publicKey;
        jqUnit.assertDeepEq("package data should match what was provided (without the public key)",
            gpii.tests.iod.packageFile.testData.packageData, packageDataObject);

        var packageSignature =  data.slice(offset, offset += signatureLength);
        jqUnit.assertDeepEq("package signature should be the expected one",
            gpii.tests.iod.packageFile.testData.signature, packageSignature);

        jqUnit.assertEquals("There should be no more data after the package signature", offset, data.length);

        jqUnit.start();
    }, jqUnit.fail);
});

gpii.tests.iod.packageFile.checkPackageFileInfo = function (packageFile, packageFileInfo, installerFile) {
    // Check the header
    var header = packageFileInfo.header;

    jqUnit.assertEquals("header.identity", gpii.iodServer.packageFile.fileIdentity, header.identity);

    jqUnit.assertEquals("header.packageDataLength and buffer length should match",
        Buffer.from(packageFileInfo.packageDataJson).length, header.packageDataLength);

    jqUnit.assertEquals("header.signatureLength and buffer length should match",
        packageFileInfo.signature.length, header.signatureLength);

    if (installerFile) {
        var installerStats = fs.statSync(installerFile);
        jqUnit.assertEquals("header.installerLength should be the installerFile size",
            installerStats.size, header.installerLength);
    } else {
        jqUnit.assertEquals("header.installerLength should be zero (no installer payload)", 0, header.installerLength);
    }

    var stats = fs.statSync(packageFile);
    jqUnit.assertEquals("header.installerOffset", stats.size - header.installerLength, header.installerOffset);

    // Signed package data tests
    var obj = JSON.parse(packageFileInfo.packageDataJson);
    jqUnit.assertDeepEq("packageDataJson should become the same as packageData",
        packageFileInfo.packageData, obj);

    jqUnit.assertTrue("packageFileInfo.verified should be true", packageFileInfo.verified);

};

jqUnit.asyncTest("Read a simple package file", function () {

    var packageFile = path.join(os.tmpdir(), "gpii-package" + Math.random());
    tempFiles.push(packageFile);

    gpii.tests.iod.packageFile.createSamplePackage(packageFile).then(function () {
        gpii.iodServer.packageFile.read(packageFile).then(function (packageFileInfo) {

            jqUnit.assertFalse("package fd should not be returned", packageFileInfo.hasOwnProperty("fd"));

            gpii.tests.iod.packageFile.checkPackageFileInfo(packageFile, packageFileInfo, null);

            // Check the signature matches
            jqUnit.assertDeepEq("signature should be the pre-calculated one",
                gpii.tests.iod.packageFile.testData.signature, packageFileInfo.signature);

            // Test the verification
            var verified = crypto.createVerify("RSA-SHA512")
                .update(packageFileInfo.packageDataJson)
                .verify(gpii.tests.iod.packageFile.testKey.publicKey, gpii.tests.iod.packageFile.testData.signature);

            jqUnit.assertTrue("packageDataJson signing should be good", verified);

            jqUnit.start();
        });
    });
});

jqUnit.asyncTest("Create a package file with an installer", function () {
    var packageFile = path.join(os.tmpdir(), "gpii-package" + Math.random()),
        installerFile = path.join(os.tmpdir(), "gpii-package" + Math.random());

    tempFiles.push(packageFile);
    tempFiles.push(installerFile);

    fs.writeFileSync(installerFile, "installer payload");

    var packageData = fluid.copy(gpii.tests.iod.packageFile.testData.packageData);

    gpii.iodServer.packageFile.create(packageData, installerFile, gpii.tests.iod.packageFile.testKey, packageFile).then(function () {
        // Read the output file
        var readPromise = gpii.iodServer.packageFile.read(packageFile, {
            keepOpen: true
        });

        readPromise.then(function (packageFileInfo) {

            gpii.tests.iod.packageFile.checkPackageFileInfo(packageFile, packageFileInfo, installerFile);

            jqUnit.assertEquals("fd should be a number", "number", typeof(packageFileInfo.fd));

            // Read the rest of the file
            var installer = fs.readFileSync(packageFileInfo.fd);
            fs.closeSync(packageFileInfo.fd);

            var expectedInstaller = fs.readFileSync(installerFile);
            jqUnit.assertDeepEq("installer payload should match what was given", expectedInstaller, installer);

            // Check the installer hash
            jqUnit.assertTrue("packageData should contain the installerHash field",
                !!packageFileInfo.packageData.installerHash);

            var expectedHash = crypto.createHash("sha512").update(installer).digest("hex");

            jqUnit.assertEquals("installer hash should be correct", expectedHash, packageFileInfo.packageData.installerHash);

            jqUnit.start();
        });
    });
});
