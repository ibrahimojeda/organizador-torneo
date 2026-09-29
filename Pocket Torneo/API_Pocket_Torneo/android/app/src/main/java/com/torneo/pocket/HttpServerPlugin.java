package com.torneo.pocket;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HttpServer")
public class HttpServerPlugin extends Plugin {

    private static final String TAG = "HttpServerPlugin";
    private LocalHttpServer server = null;

    @PluginMethod
    public void startServer(PluginCall call) {
        try {
            if (server == null) {
                server = new LocalHttpServer(getContext());
                server.start();
                Log.i(TAG, "Server started on port 8888");
            } else {
                Log.i(TAG, "Server already running");
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("ip", LocalHttpServer.getLocalIpAddress());
            ret.put("port", 8888);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start server", e);
            call.reject("Failed to start server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopServer(PluginCall call) {
        try {
            if (server != null) {
                server.stop();
                server = null;
                Log.i(TAG, "Server stopped");
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setState(PluginCall call) {
        try {
            String json = call.getString("state", "{}");
            if (server != null) {
                server.setState(json);
            }
            call.resolve(new JSObject().put("success", true));
        } catch (Exception e) {
            call.reject("Failed to set state: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getIp(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ip", LocalHttpServer.getLocalIpAddress());
        ret.put("port", 8888);
        call.resolve(ret);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", server != null);
        call.resolve(ret);
    }
}