'use strict';

/*
 * A simple, robust websocket client implementation for the JabRef-Browser-Extension for bidirectional communication.
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

    // configuration (must be configured before starting the client)
    configuration: {
        websocketScheme: "ws", // "ws" or "wss"
        websocketHost: "localhost", // "localhost", "127.0.0.1", ...
        websocketPort: "8855",

        heartbeatEnabled: true,
        heartbeatInterval: 6000, // [ms] should be an even number
        heartbeatToleranceFactor: 0.5,

        tryReconnect: true // true: tries to reconnect, if not connected
    },

    tryReconnectFlag: false,
    wsReconnectInterval: 5000, // [ms]

    connection: null,
    heartbeatTimeout: null, // timeout instance

    getConfiguration: function () {
        return wsClient.configuration;
    },

    /**
     * should be called before starting the websocket client
     * @param configuration
     */
    setConfiguration: function (configuration) {
        wsClient.configuration = configuration;
    },

    heartbeat: function () {
        console.log("[ws] heartbeat called...");

        clearTimeout(wsClient.heartbeatTimeout);

        if (wsClient.configuration.heartbeatEnabled) {

            wsClient.heartbeatTimeout = setTimeout(() => {
                console.log("[ws] closing websocket (reason: no heartbeat in time)");
                wsClient.connection.close();
            }, wsClient.configuration.heartbeatInterval * (1 + wsClient.configuration.heartbeatToleranceFactor));
        }
    },

    sendMessage: function (wsAction, messagePayload) {
        let messageContainer = {};
        messageContainer.action = wsAction;
        messageContainer.payload = messagePayload;

        wsClient.connection.send(JSON.stringify(messageContainer));
    },

    closeConnection: function () {
        wsClient.tryReconnectFlag = false; // disable trying to reconnect, if closing connection was triggered manually
        wsClient.connection.close();
    },

    init: function () {
        if (!("WebSocket" in window)) {
            console.log("[ws] Websockets are not supported by this browser! Please use another browser.");

            return;
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
                    wsClient.init();
                }, wsClient.wsReconnectInterval);
            }
        };

        wsClient.connection.onerror = function (event) {
            console.log(`[ws] @onError`);
            clearTimeout(wsClient.heartbeatTimeout);
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
    },

    handlerHeartbeat: function (messagePayload) {
        if (wsClient.configuration.heartbeatEnabled) {
            wsClient.heartbeat();
        }
    },

    handlerInfoConfiguration: function (messagePayload) {
        wsClient.configuration.heartbeatEnabled = messagePayload.heartbeatEnabled;
        wsClient.configuration.heartbeatInterval = messagePayload.heartbeatInterval;
        wsClient.configuration.heartbeatToleranceFactor = messagePayload.heartbeatToleranceFactor;

        if (wsClient.configuration.heartbeatEnabled) {
            wsClient.heartbeat();
        } else {
            clearTimeout(wsClient.heartbeatTimeout);
        }
    },

    handlerInfoMessage: function (messagePayload) {
        console.log("[ws] " + messagePayload.messageType + ": " + messagePayload.message);
    },

    handlerCmdFetchGoogleScholarCitationCounts: function (messagePayload) {

    },

    handlerCmdContinueFetchGoogleScholarCitationCounts: function (messagePayload) {

    },
};