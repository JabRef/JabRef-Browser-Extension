'use strict';

/*
 * A simple, robust websocket client implementation for the JabRef-Browser-Extension for bidirectional communication with JabRef.
 */
let wsClient = {
    WsAction: {
        // receive only
        HEARTBEAT: "heartbeat",
        INFO_CONFIGURATION: "info.configuration",
        CMD_FETCH_GOOGLE_SCHOLAR_CITATION_COUNTS: "cmd.fetchGoogleScholarCitationCounts",
        CMD_CONTINUE_FETCH_GOOGLE_SCHOLAR_CITATION_COUNTS: "cmd.continueFetchGoogleScholarCitationCounts",

        // send only
        CMD_REGISTER: "cmd.register",
        INFO_GOOGLE_SCHOLAR_CITATION_COUNTS: "info.googleScholarCitationCounts",
        INFO_FETCH_GOOGLE_SCHOLAR_CITATION_COUNTS_INTERRUPTED: "info.fetchGoogleScholarCitationCountsInterrupted",

        // send and receive
        INFO_MESSAGE: "info.message"
    },

    WsClientType: {
        UNKNOWN: "unknown",
        JABREF_BROWSER_EXTENSION: "JabRefBrowserExtension"
    },

    // internals
    connection: null, // socket
    heartbeatTimeout: null, // timeout instance
    tryReconnectFlag: false,

    // client state
    clientStarted: false,

    // configuration (must be configured before starting the client)
    configuration: {
        websocketScheme: "ws", // "ws" or "wss"
        websocketHost: "localhost", // "localhost", "127.0.0.1", ...
        websocketPort: 8855, // default port: 8855

        heartbeatEnabled: true,
        heartbeatInterval: 6000, // [ms] should be an even number
        heartbeatToleranceFactor: 0.5,

        tryReconnect: true, // true: tries to reconnect, if not connected
        wsReconnectInterval: 6000 // [ms]
    },

    getConfiguration: function () {
        return wsClient.configuration;
    },

    /**
     * should be called before starting the websocket client
     *
     * @param configuration
     */
    setConfiguration: function (configuration) {
        wsClient.configuration = configuration;
    },

    /**
     *
     * @returns {number}
     *          -1 ... n/a<br>
     *           0 ... WebSocket.CONNECTING<br>
     *           1 ... WebSocket.OPEN<br>
     *           2 ... WebSocket.CLOSING<br>
     *           3 ... WebSocket.CLOSED
     */
    getConnectionState: function () {
        if (wsClient.connection) {
            return wsClient.connection.readyState;
        } else {
            return -1;
        }
    },

    getConnectionStateAsText: function () {
        let readyStateText;

        switch (wsClient.getConnectionState()) {
            case WebSocket.CONNECTING:
                readyStateText = "connecting";
                break;
            case WebSocket.OPEN:
                readyStateText = "open";
                break;
            case WebSocket.CLOSING:
                readyStateText = "closing";
                break;
            case WebSocket.CLOSED:
                readyStateText = "closed";
                break;
            default:
                readyStateText = "n/a";
        }

        return readyStateText;
    },

    heartbeat: function () {
        console.log("[ws] heartbeat called...");

        clearTimeout(wsClient.heartbeatTimeout);

        if (wsClient.configuration.heartbeatEnabled) {
            wsClient.heartbeatTimeout = setTimeout(() => {
                console.log("[ws] closing websocket (reason: no heartbeat received in time)");
                wsClient.closeConnection();
            }, wsClient.configuration.heartbeatInterval * (1 + wsClient.configuration.heartbeatToleranceFactor));
        }
    },

    sendMessage: function (wsAction, messagePayload) {
        if (!wsClient.clientStarted) {
            return false;
        }

        if (!wsAction || !messagePayload) {
            return false;
        }

        if (wsClient.connection && wsClient.getConnectionState() === WebSocket.OPEN) {
            let messageContainer = {};
            messageContainer.action = wsAction;
            messageContainer.payload = messagePayload;

            wsClient.connection.send(JSON.stringify(messageContainer));

            return true;
        } else {
            return false;
        }
    },

    startClient: function () {
        if (wsClient.clientStarted) {
            console.log("[ws] wsClient has already been started");

            return false;
        } else {
            if (!("WebSocket" in window)) {
                console.log("[ws] wsClient could not be started, since WebSockets are not supported by this browser. Please use another browser.");

                return;
            }

            console.log("[ws] wsClient is starting up...");

            wsClient.clientStarted = true;
            wsClient.openConnection();

            return true;
        }
    },

    stopClient: function () {
        if (wsClient.clientStarted) {
            console.log("[ws] stopping wsClient...");

            wsClient.tryReconnectFlag = false; // disable trying to reconnect
            wsClient.closeConnection();
            wsClient.clientStarted = false;

            return true;
        } else {
            console.log("[ws] wsClient is not started");

            return false;
        }
    },

    stopClientForcefully: function () {
        console.log("[ws] wsClient will stop forcefully...");

        wsClient.tryReconnectFlag = false; // disable trying to reconnect
        wsClient.closeConnection();
        wsClient.clientStarted = false;

        return true;
    },

    isClientStarted: function () {
        return wsClient.clientStarted;
    },

    /**
     * closes the connection; if <code>tryReconnect</code> is <code>true</code>, then a new connection will be established
     *
     * @returns {boolean}
     */
    closeConnection: function () {
        if (wsClient.clientStarted && wsClient.connection) {
            wsClient.connection.close();

            return true;
        } else {
            return false;
        }
    },

    openConnection: function () {
        if (!wsClient.clientStarted) {
            console.log("[ws] wsClient must be started before opening a connection");

            return false;
        }

        wsClient.tryReconnectFlag = wsClient.configuration.tryReconnect;

        wsClient.connection = new WebSocket(wsClient.configuration.websocketScheme + "://" + wsClient.configuration.websocketHost + ":" + wsClient.configuration.websocketPort);

        wsClient.connection.onopen = function (event) {
            console.log("[ws] @onOpen: connection established");

            if (wsClient.configuration.heartbeatEnabled) {
                wsClient.heartbeat();
            }

            let messagePayload = {};
            messagePayload.wsClientType = wsClient.WsClientType.JABREF_BROWSER_EXTENSION;

            wsClient.sendMessage(wsClient.WsAction.CMD_REGISTER, messagePayload);
        };

        wsClient.connection.onerror = function (event) {
            console.log(`[ws] @onError`);
        };

        wsClient.connection.onclose = function (event) {
            // onclose() will be called:
            // - in case the connection gets closed properly
            // - after onerror() [if the underlying websocket is implemented properly]
            // - after unsuccessful connection attempt
            // - see:
            //   - https://stackoverflow.com/questions/40084398/is-onclose-always-called-after-onerror-for-websocket
            //   - https://html.spec.whatwg.org/multipage/web-sockets.html

            if (event.wasClean) {
                console.log(`[ws] @onClose: connection closed cleanly (code="${event.code}", reason="${event.reason}")`);
            } else {
                // e.g. server process killed or network down
                // event.code is usually 1006 in this case
                console.log(`[ws] @onClose: connection died (code="${event.code}", reason="${event.reason}")`);
            }

            clearTimeout(wsClient.heartbeatTimeout);

            if (wsClient.tryReconnectFlag) {
                setTimeout(() => {
                    console.log("[ws] trying to connect...");
                    wsClient.openConnection();
                }, wsClient.configuration.wsReconnectInterval);
            } else {
                wsClient.clientStarted = false;
            }
        };

        wsClient.connection.onmessage = function (event) {
            console.log(`[ws] @onMessage: ${event.data}`);

            let messageContainer = JSON.parse(event.data);

            let action = messageContainer.action;
            let messagePayload = messageContainer.payload;

            if (!Object.values(wsClient.WsAction).includes(action)) {
                console.log("[ws] unknown WsAction received: " + action);
                return;
            }

            if (action === wsClient.WsAction.HEARTBEAT) {
                wsClient.handlerHeartbeat(messagePayload);
            } else if (action === wsClient.WsAction.INFO_CONFIGURATION) {
                wsClient.handlerInfoConfiguration(messagePayload);
            } else if (action === wsClient.WsAction.INFO_MESSAGE) {
                wsClient.handlerInfoMessage(messagePayload);
            } else if (action === wsClient.WsAction.CMD_FETCH_GOOGLE_SCHOLAR_CITATION_COUNTS) {
                wsClient.handlerCmdFetchGoogleScholarCitationCounts(messagePayload);
            } else if (action === wsClient.WsAction.CMD_CONTINUE_FETCH_GOOGLE_SCHOLAR_CITATION_COUNTS) {
                wsClient.handlerCmdContinueFetchGoogleScholarCitationCounts(messagePayload);
            } else {
                console.log("[ws] unimplemented WsAction received: " + action);
            }
        };

        return true;
    },

    handlerHeartbeat: function (messagePayload) {
        if (wsClient.configuration.heartbeatEnabled) {
            wsClient.heartbeat();
        }
    },

    /**
     * synchronizes the server configuration with the client configuration
     *
     * @param messagePayload
     */
    handlerInfoConfiguration: function (messagePayload) {
        wsClient.configuration.heartbeatEnabled = messagePayload.heartbeatEnabled;
        wsClient.configuration.heartbeatInterval = messagePayload.heartbeatInterval;
        wsClient.configuration.heartbeatToleranceFactor = messagePayload.heartbeatToleranceFactor;

        if (wsClient.configuration.heartbeatEnabled) {
            wsClient.heartbeat();
        } else {
            clearTimeout(wsClient.heartbeatTimeout);
        }

        console.log("[ws] wsClient configuration has been synchronized with server configuration")
    },

    handlerInfoMessage: function (messagePayload) {
        console.log("[ws] " + messagePayload.messageType + ": " + messagePayload.message);
    },

    handlerCmdFetchGoogleScholarCitationCounts: function (messagePayload) {
        let items = messagePayload.entries;

        // create zsc compatible items
        for (var i = 0; i < items.length; i++) {
            items[i] = new ZscItem(items[i]);
            // add internal metadata
            items[i].setField('_externalRequest', true); // false: triggered from browser; true: triggered from JabRef
            items[i].setStatus(false, true, false, false); // init: no success, item complete (initial assumption), no captcha, not too many requests
        }

        // get citations counts for all items
        zsc.processItems(items);

        wsClient.sendMessage(wsClient.WsAction.INFO_GOOGLE_SCHOLAR_CITATION_COUNTS, messagePayload);
    },

    handlerCmdContinueFetchGoogleScholarCitationCounts: function (messagePayload) {

    },
};
