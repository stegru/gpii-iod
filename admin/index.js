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

fluid.module.register("gpii-iod-server-admin", __dirname, require);

require("./server/login.js");
require("gpii-express");
require("gpii-handlebars");

var expressSession = require("express-session");
var MemoryStore = require("memorystore")(expressSession);


fluid.defaults("gpii.iodServer.admin", {
    gradeNames: ["gpii.express"],
    components: {
        hb: {
            type: "gpii.express.hb",
            options: {
                templateDirs: ["%gpii-iod-server-admin/client/templates"]
            }
        },
        urlencoded: {
            type: "gpii.express.middleware.bodyparser.urlencoded"
        },
        cookieparser: {
            type: "gpii.express.middleware.cookieparser",
            options: {
                priority: "first"
            }
        },
        session: {
            type: "gpii.express.middleware.session",
            options: {
                priority: "after:cookieparser",
                middlewareOptions: {
                    saveUninitialized: false,
                    resave: true,
                    name: "iod",
                    secret: Math.random().toString(),
                    maxAge: 10,
                    store: {
                        expander: {
                            funcName: "gpii.iodServer.admin.sessionStore",
                            args: [{
                                checkPeriod: 3.6e+6, // 1 hour
                                //ttl: 1.8e+6, // 30 mins
                                ttl: 10000, // 30 mins
                                max: 0xa0000
                            }]
                        }
                    }
                }
            }
        },

        staticRoute: {
            type: "gpii.express.router.static",
            options: {
                priority: "before:cookieparser",
                path: "/static",
                content: "%gpii-iod-server-admin/client/static"
            }
        },

        login: {
            type: "gpii.iodServer.admin.loginHandler",
            options: {
                path: "/login",
                method: [ "get", "post" ],
                noAuth: true,
                defaultTemplate: "login",
                priority: "after:session"
            }
        }


    }
});

// General request handler
fluid.defaults("gpii.iodServer.admin.middleware", {
    gradeNames: ["gpii.handlebars.dispatcherMiddleware"],
    templateDirs: ["%gpii-iod-server-admin/client/templates"],
    invokers: {
        middleware: {
            funcName: "gpii.iodServer.admin.handleRequest",
            args: ["{that}", "{arguments}.0", "{arguments}.1", "{arguments}.2" ]
        },
        checkAuth: {
            funcName: "gpii.iodServer.admin.middleware.checkAuth",
            args: ["{that}", "{arguments}.0", "{arguments}.1" ] // req, res.
        }
    }

});

/**
 *
 * @param {Component} that Handler instance.
 * @param {Request} req The request.
 * @param {Response} res The response.
 */
gpii.iodServer.admin.middleware.checkAuth = function (that, req, res) {
    var authorised = that.options.noAuth || req.session.loggedIn;
    if (!authorised) {
        res.status(303).redirect("/login");
    }

    return authorised;
};

/**
 *
 * @param {Component} that Handler instance.
 * @param {Request} req The request.
 * @param {Response} res The response.
 * @param {Function} next Next middleware function
 */
gpii.iodServer.admin.handleRequest = function (that, req, res, next) {
    var authorised = that.checkAuth(req, res);

    var handlerPromise;

    if (authorised) {
        var handler = that[req.method.toLowerCase()];
        if (handler) {
            handlerPromise = fluid.toPromise(handler(req, res));
        }
    }

    if (handlerPromise) {
        handlerPromise.then(function (value) {
            if (!value && !res.headersSent) {
                if (req.method !== "GET") {
                    res.status(303).redirect(req.url);
                } else {
                    gpii.handlebars.dispatcherMiddleware.middleware(that, req, res, next);
                }
            }
        }, function (err) {
            if (!res.headersSent && !res.statusCode) {
                res.status(err.statusCode || 500);
            }
            next({
                error: err
            });
        });
    }
};

/**
 * Instantiate the session storage.
 *
 * Returns an instance of memorystore (https://github.com/roccomuso/memorystore), which is a non-leaking MemoryStore.
 *
 * @param {Object} options Options for memorystore.
 * @return {MemoryStore} The session storage.
 */
gpii.iodServer.admin.sessionStore = function (options) {
    return new MemoryStore(options);
};

