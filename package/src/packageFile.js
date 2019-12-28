/*
 * IoD packages file
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

var gpii = fluid.registerNamespace("gpii");
fluid.registerNamespace("gpii.iodServer.packageFile");

var fs = require("fs"),
    path = require("path"),
    crypto = require("crypto"),
    util = require("util");

gpii.iodServer.packageFile.fileIdentity = "gpii-iod-package-v1\0";

// file-id + 3x 32bit lengths (for packageData, signature, and installation file)
gpii.iodServer.packageFile.headerLength = gpii.iodServer.packageFile.fileIdentity.length + 3 * 4;

/**
 * @typedef Key {Object}
 * @property {String} key Private key (PEM encoded)
 * @property {String} passphrase [optional] Passphrase for the private key.
 * @property {String} publicKey Public key (PEM encoded)
 */

/**
 * Calculate the hash of a file.
 *
 * @param {String} file The file.
 * @param {String} algorithm [optional] The algorithm. [default: sha512]
 * @return {Promise<Buffer>} Resolves with the hash.
 */
gpii.iodServer.packageFile.hashFile = function (file, algorithm) {
    var promise = fluid.promise();
    if (!algorithm) {
        algorithm = "sha512";
    }

    try {
        var hash = crypto.createHash(algorithm);

        hash.on("error", function (e) {
            promise.reject(e);
        });
        hash.on("finish", function () {
            var result = hash.read();
            promise.resolve(result);
        });

        var input = fs.createReadStream(file);
        input.pipe(hash);

        input.on("error", function (e) {
            promise.reject(e);
        });

    } catch (e) {
        promise.reject(e);
    }

    return promise;
};

/**
 * Adds the size and hash of the installer file to a {PackageData} object.
 * @param {PackageData} packageData The package data
 * @param {String} installerFile Path to the installer file.
 * @return {Promise<PackageData>} Resolves with the new package data object.
 */
gpii.iodServer.packageFile.preparePackageData = function (packageData, installerFile) {
    var installerFileStats;
    var hashPromise;
    packageData = fluid.copy(packageData);

    var promise = fluid.promise();

    // Get the hash of the installation
    if (installerFile) {
        installerFileStats = fs.statSync(installerFile);
        hashPromise = gpii.iodServer.packageFile.hashFile(installerFile);
    } else {
        hashPromise = fluid.toPromise(undefined);
    }

    hashPromise.then(function (installerHash) {
        var failed = false;

        var computedPackageData = {};
        if (installerHash) {
            computedPackageData.installerHash = installerHash.toString("hex");
        }
        if (installerFile) {
            computedPackageData.installerSize = installerFileStats.size;
        }

        if (packageData.installer) {
            if (!installerFile) {
                promise.reject({
                    isError: true,
                    message: "packageData expects an installer file"
                });
                failed = true;
            }
        } else {
            computedPackageData.installer = installerFile ? path.basename(installerFile) : undefined;
        }

        if (!failed) {
            // Copy the computed fields onto the package data, if they don't exist.
            fluid.each(computedPackageData, function (value, key) {
                var oldValue = packageData[key];
                if (oldValue && oldValue !== value) {
                    // If things like the hash are already in the package data, and the hash has changed, then there could
                    // be something wrong. Let the user investigate.
                    failed = true;
                    fluid.log("'" + key + "' is already specified in the package data, but is no longer correct. Current value: '"
                        + oldValue + "', New value: '" + value + "'");
                } else {
                    packageData[key] = value;
                }
            });
        }

        if (failed) {
            promise.reject({
                isError: true,
                message: "A value in the packageData does not match reality. See log for more info."
            });
        } else {
            promise.resolve(packageData);
        }

    }, promise.reject);

    return promise;
};

/**
 * Reads a PEM encoded key.
 *
 * PEM encoding is just base64 data between a header and footer.
 *
 * This assumes only a single key is in the PEM data.
 *
 * @param {String} pem The PEM encoded key.
 * @return {Buffer} Returns a buffer containing the key. null if the PEM is invalid.
 */
gpii.iodServer.packageFile.readPEM = function (pem) {
    // Extract the base64 encoding from the PEM - that is, anything between the "-----BEGIN *" and -----END *" lines.

    // eslint complains about the 's' flag if it's a literal regex.
    var re = new RegExp(".*(:?\n|^)-----BEGIN[^\n]*\n(.*\n)?-----END.*", "s");
    var match = re.exec(pem);
    return match ? Buffer.from(match[2] || "", "base64") : null;
};

/**
 * Signs the package data.
 *
 * The object is serialised and the string is signed.
 *
 * @param {PackageData} packageData The object to sign.
 * @param {Key} key Object containing the public and private key.
 * @return {Object} Returns an object containing the packageJson and signature.
 */
gpii.iodServer.packageFile.signPackageData = function (packageData, key) {
    var togo = {};
    var data = fluid.copy(packageData);

    // Include the public key used to sign this package.
    data.publicKey = gpii.iodServer.packageFile.readPEM(key.publicKey).toString("base64");

    // Sign the package data
    var packageJson = JSON.stringify(data);
    togo.buffer = Buffer.from(packageJson, "utf8");

    var sign = crypto.createSign("RSA-SHA512");
    sign.update(togo.buffer);
    togo.signature = sign.sign(key);

    return togo;
};

/**
 * Creates a package file.
 *
 * @param {String|PackageData} packageDataFile File (or an object) containing the package meta data
 * @param {String} installerFile [optional] The installer file.
 * @param {Key} key The key used to sign the package data.
 * @param {String} saveAs The path of the new package file.
 * @return {Promise} Resolves when complete.
 */
gpii.iodServer.packageFile.create = function (packageDataFile, installerFile, key, saveAs) {

    var promise = fluid.promise();

    // Load the package data
    var origPackageData = fluid.isPlainObject(packageDataFile)
        ? packageDataFile
        : JSON.parse(fs.readFileSync(packageDataFile, "utf8"));

    var packageDataPromise = gpii.iodServer.packageFile.preparePackageData(origPackageData, installerFile);

    packageDataPromise.then(function (packageData) {
        var signedPackageData = gpii.iodServer.packageFile.signPackageData(packageData, key);

        // Initial file buffer contains the header, package data, and signature.
        var packageBuffer = Buffer.alloc(
            gpii.iodServer.packageFile.headerLength + signedPackageData.buffer.length + signedPackageData.signature.length);

        // Create the header
        var offset = 0;
        offset += packageBuffer.write(gpii.iodServer.packageFile.fileIdentity, "ascii");
        offset = packageBuffer.writeUInt32LE(signedPackageData.buffer.length, offset);
        offset = packageBuffer.writeUInt32LE(signedPackageData.signature.length, offset);
        offset = packageBuffer.writeUInt32LE(packageData.installerSize, offset);
        // Add the package data
        offset += signedPackageData.buffer.copy(packageBuffer, offset);
        // Add the package data signature
        offset += signedPackageData.signature.copy(packageBuffer, offset);

        // The rest of the package file is the installer

        var fileStream = fs.createWriteStream(saveAs, {mode: parseInt("600", 8)});
        fileStream.write(packageBuffer, function (err) {
            if (err) {
                promise.reject(err);
            } else if (!installerFile) {
                promise.resolve();
            } else {
                // Pipe the installer to the file
                var installerStream = fs.createReadStream(installerFile);
                installerStream.on("error", function (err) {
                    promise.reject(err);
                });
                fileStream.on("finish", function () {
                    promise.resolve();
                });
                installerStream.pipe(fileStream);
            }
        });
    });

    return promise;
};

/**
 * @typedef PackageFileHeader {Object}
 * @property {String} identity The file type identity.
 * @property {Number} packageDataLength The package metadata length.
 * @property {Number} signatureLength The signature length.
 * @property {Number} installerLength The installer length.
 * @property {Number} installerOffset The installer offset (calculated).
 */

/**
 * @typedef PackageFileInfo {Object}
 * @property {String} path The package file path.
 * @property {PackageFileHeader} header The header.
 * @property {PackageData} packageData The package metadata.
 * @property {String} packageDataJson The package data in its original form.
 * @property {Buffer} signature The signature of the package data.
 * @property {Boolean} verified true if the packageData and signature have been verified.
 * @property {Number|null} fd The file descriptor.
 */

/**
 *
 * @param {String} packageFile Path to the package file.
 * @param {Object} options Options
 * @param {Boolean} options.keepOpen True to keep the file open, returning the file descriptor in `PackageFileInfo.fd`.
 *      The position will be at the beginning of the installer payload.
 * @return {Promise<PackageFileInfo>} A promise resolving when the file has been read and parsed.
 */
gpii.iodServer.packageFile.read = function (packageFile, options) {
    if (!options) {
        options = {};
    }
    var promise = fluid.promise();

    var open = util.promisify(fs.open);

    open(packageFile, "r").then(function (fd) {

        /** @type {PackageFileInfo} */
        var packageFileInfo = {
            path: packageFile,
            fd: fd
        };

        var work = [
            // Read the header
            gpii.iodServer.packageFile.readHeader,
            // Get the package data and its signature
            gpii.iodServer.packageFile.readPackageData,
            // Check the data and signature
            gpii.iodServer.packageFile.verifyPackageData
        ];

        var closeFile = function () {
            fs.closeSync(packageFileInfo.fd);
            delete packageFileInfo.fd;
        };

        fluid.promise.sequence(work, packageFileInfo).then(function () {
            if (!options.keepOpen) {
                closeFile();
            }
            promise.resolve(packageFileInfo);
        }, function (reason) {
            closeFile();
            promise.reject(reason);
        });
    });

    return promise;
};

/**
 * Reads the header of a package file.
 *
 * @param {PackageFileInfo} packageFileInfo Current information about the package file (gets modified).
 * @return {Promise<PackageFileInfo>} A promise resolving when the header has been read.
 */
gpii.iodServer.packageFile.readHeader = function (packageFileInfo) {
    var promise = fluid.promise();
    var buffer = Buffer.alloc(gpii.iodServer.packageFile.headerLength);

    fs.read(packageFileInfo.fd, buffer, 0, buffer.length, null, function (err, bytesRead) {
        if (err) {
            promise.reject(err);
        } else if (bytesRead !== buffer.length) {
            promise.reject({
                isError: true,
                message: "File is too short (header is incomplete)",
                bytesRead: bytesRead,
                packageFileInfo: packageFileInfo
            });
        } else {
            var offset = 0;
            var intSize = 4;
            var header = packageFileInfo.header = {};

            header.identity = buffer.toString("ascii", offset, gpii.iodServer.packageFile.fileIdentity.length);
            if (header.identity === gpii.iodServer.packageFile.fileIdentity) {
                offset += header.identity.length;

                header.packageDataLength = buffer.readUInt32LE(offset);
                offset += intSize;
                header.signatureLength = buffer.readUInt32LE(offset);
                offset += intSize;
                header.installerLength = buffer.readUInt32LE(offset);
                offset += intSize;

                header.installerOffset = offset + header.packageDataLength + header.signatureLength;

                promise.resolve(packageFileInfo);
            } else {
                promise.reject({
                    isError: true,
                    message: "This file isn't a recognisable package file."
                });
            }
        }
    });
    return promise;
};

/**
 * Reads the package data block and its signature from a package file.
 *
 * @param {PackageFileInfo} packageFileInfo Current information about the package file (gets modified).
 * @return {Promise<PackageFileInfo>} A promise resolving when the package data has been read.
 */
gpii.iodServer.packageFile.readPackageData = function (packageFileInfo) {
    var promise = fluid.promise();

    var buffer = Buffer.alloc(packageFileInfo.header.packageDataLength + packageFileInfo.header.signatureLength);

    fs.read(packageFileInfo.fd, buffer, 0, buffer.length, null, function (err, bytesRead) {
        if (err) {
            promise.reject(err);
        } else if (bytesRead !== buffer.length) {
            promise.reject({
                isError: true,
                message: "File is too short (or the header is corrupted)",
                bytesRead: bytesRead,
                packageFileInfo: packageFileInfo
            });
        } else {
            // Get the package data object.
            var packageDataBuffer =
                buffer.slice(0, packageFileInfo.header.packageDataLength);
            // Get the signature.
            packageFileInfo.signature = buffer.slice(packageFileInfo.header.packageDataLength,
                packageFileInfo.header.packageDataLength + packageFileInfo.header.signatureLength);

            // Parse the package data
            try {
                packageFileInfo.packageDataJson = packageDataBuffer.toString();
                packageFileInfo.packageData = JSON.parse(packageFileInfo.packageDataJson);
            } catch (e) {
                promise.reject({
                    isError: true,
                    message: "Error parsing packageData",
                    error: e
                });
            }

            if (packageFileInfo.packageData) {
                promise.resolve(packageFileInfo);
            }
        }
    });

    return promise;
};

/**
 * Checks that the package data and signature are good.
 *
 * @param {PackageFileInfo} packageFileInfo Current information about the package file (gets modified).
 * @return {Promise<PackageFileInfo>} A promise resolving when the signature has been checked.
 */
gpii.iodServer.packageFile.verifyPackageData = function (packageFileInfo) {
    var promise = fluid.promise();

    // Verify the package data with the signature.
    var verify = crypto.createVerify("RSA-SHA512");
    verify.update(packageFileInfo.packageDataJson);

    // PEM encode the key - it's already base64 encoded, so just surround with the header and footer.
    var publicKey = "-----BEGIN PUBLIC KEY-----\n"
        + packageFileInfo.packageData.publicKey
        + "\n-----END PUBLIC KEY-----\n";

    try {
        packageFileInfo.verified = verify.verify(publicKey, packageFileInfo.signature);

        if (packageFileInfo.verified) {
            promise.resolve(packageFileInfo);
        } else {
            promise.reject({
                isError: true,
                message: "PackageData failed verification"
            });
        }
    } catch (e) {
        promise.reject({
            isError: true,
            message: "PackageData failed verification (exception)",
            error: e
        });
    }

    return promise;
};

