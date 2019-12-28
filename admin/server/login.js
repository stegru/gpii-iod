/*
 * IoD administration portal.
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


fluid.defaults("gpii.iodServer.admin.loginHandler", {
    gradeNames: ["gpii.iodServer.admin.middleware"],
    invokers: {
        get: {
            funcName: "gpii.iodServer.admin.loginHandler.get",
            args: ["{that}", "{arguments}.0", "{arguments}.1" ]
        },
        post: {
            funcName: "gpii.iodServer.admin.loginHandler.post",
            args: ["{that}", "{arguments}.0", "{arguments}.1" ]
        }
    }
});

/**
 *
 * @param that
 * @param {Request} req
 * @param {Response} res
 */
gpii.iodServer.admin.loginHandler.get = function (that, req, res) {
    if (req.session.loggedIn) {
        res.status(303).redirect("/");
    }
    return req.session.loggedIn;
};

gpii.iodServer.admin.loginHandler.post = function (that, req, res) {
    req.session.loggedIn = req.body.username === "user" && req.body.password === "pass";
    if (req.session.loggedIn) {
        res.status(303).redirect("/");
    }

    return req.session.loggedIn;
};
