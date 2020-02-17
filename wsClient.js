'use strict';

let wsClient = {
    _connection: null,
    _pingTimeout: null,

    heartbeat: function () {
        clearTimeout(this._pingTimeout);

        // Delay should be equal to the interval at which the server
        // sends out pings plus a conservative assumption of the latency.
        this._pingTimeout = setTimeout(() => {
            //this._connection.close();
        }, 30000 + 1000);
    },

    send: function (message) {
        //this._connection.send(JSON.stringify(message);
        this._connection.send(message);
    },

    close: function (message) {
        this._connection.close();
    },

    init: function () {

        wsClient._connection = new WebSocket("ws://localhost:8855");

        this._connection.onopen = function (event) {
            console.log("[open] Connection established");
            console.log("Sending to server");
            wsClient.heartbeat();
            wsClient.send("My name is John");
        };

        this._connection.onclose = function (event) {
            clearTimeout(wsClient._pingTimeout);
            if (event.wasClean) {
                console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
            } else {
                // e.g. server process killed or network down
                // event.code is usually 1006 in this case
                console.log('[close] Connection died');
            }
        };

        this._connection.onerror = function (event) {
            console.log(`[error] ${event.message}`);
            clearTimeout(wsClient._pingTimeout);
        };

        this._connection.onmessage = function (event) {
            console.log(`[message] Data received from server: ${event.data}`);
        };
    }
};