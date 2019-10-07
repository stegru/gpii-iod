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
require("kettle");


fluid.defaults("gpii.iod.packages", {
    gradeNames: "kettle.app",
    serverUrl: "http://localhost",
    requestHandlers: {
        packages: {
            route: "/packages/:packageName",
            method: "get",
            type: "gpii.iod.packages.handler"
        }
    },
    components: {
        "packageDataSource": {
            type: "gpii.iod.packageDataSource",
            options: {
                "readOnlyGrade": "gpii.iod.packageDataSource"
            }
        },
        "publish": {
            type: "gpii.iod.packages.publish"
        }
    }
});

fluid.defaults("gpii.iod.packages.handler", {
    gradeNames: ["kettle.request.http"],
    invokers: {
        handleRequest: {
            funcName: "gpii.iod.packages.handleRequest",
            args: [
                "{packages}", "{request}", "{request}.req.params.packageName", "{request}.req.params.lang"
            ]
        }
    }
});

iod.packages.handleRequest = function (packages, request, packageName) {
    fluid.log("package requested: " + packageName);
    packages.packageDataSource.get({packageName: packageName}).then(function (packageInfo) {
        request.events.onSuccess.fire(packageInfo);
    }, function (err) {
        fluid.log(err);

        request.events.onError.fire({
            message: "No such package",
            statusCode: err.statusCode || 404
        });
    });
};

