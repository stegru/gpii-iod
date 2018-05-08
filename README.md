# GPII Install on Demand Server

This provides two things:

* Data source for packages and package metadata
  * Provides the `/packages` end point for clients to retrieve package information.
* Web-based administration portal (TODO)


## Running

    npm start

This will start the IoD server, listening on port 8087.

If the server has the fortune of running on Linux, it will announce itself on the network so GPII will know how to
connect to it. `vagrant up` will provide this, but you may be prompted to provide the network adapter.
