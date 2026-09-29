package com.torneo.pocket;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Map;
import java.util.HashMap;
import java.util.Iterator;
import fi.iki.elonen.NanoHTTPD;

/**
 * Lightweight HTTP server running on port 8888 inside the APK.
 * Serves www files + API endpoint for the projection display.
 */
public class LocalHttpServer extends NanoHTTPD {

    private static final String TAG = "PocketHttpServer";
    private static final int PORT = 8888;
    private static final String STATE_FILE = "pocket_state.json";
    private static final String JUDGE_SCORES_FILE = "judge_scores.json";

    private final Context context;
    private final File wwwDir;
    private final File stateFile;

    // Judge scores: seat -> JSON string
    private final Map<String, String> judgeScores = new HashMap<>();

    public LocalHttpServer(Context context) throws IOException {
        super(PORT);
        this.context = context;
        this.wwwDir = new File(context.getFilesDir().getParentFile(), "assets/public");
        this.stateFile = new File(context.getCacheDir(), STATE_FILE);
        Log.i(TAG, "Server created. WWW dir: " + wwwDir.getAbsolutePath());
    }

    public static String getLocalIpAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces != null) {
                for (NetworkInterface iface : Collections.list(interfaces)) {
                    if (iface.isLoopback() || !iface.isUp()) continue;
                    for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                        if (addr instanceof java.net.Inet4Address && !addr.isLoopbackAddress()) {
                            return addr.getHostAddress();
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "IP detection failed", e);
        }
        return "127.0.0.1";
    }

    public synchronized void setState(String json) {
        try {
            FileOutputStream fos = new FileOutputStream(stateFile);
            fos.write(json.getBytes("UTF-8"));
            fos.close();
            Log.d(TAG, "State saved: " + (json.length() > 100 ? json.substring(0, 100) + "..." : json));
        } catch (IOException e) {
            Log.e(TAG, "Failed to save state", e);
        }
    }

    private String readState() {
        try {
            FileInputStream fis = new FileInputStream(stateFile);
            byte[] data = new byte[(int) stateFile.length()];
            fis.read(data);
            fis.close();
            return new String(data, "UTF-8");
        } catch (IOException e) {
            return "{}";
        }
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();
        String method = session.getMethod().toString(); // "GET" or "POST"
        Log.d(TAG, method + " " + uri);

        // CORS headers
        Response response = null;

        // Handle POST for judge scores
        if ("POST".equals(method) && "/api/judge-score".equals(uri)) {
            try {
                // Read body - NanoHTTPD parseBody takes single Map
                Map<String, String> body = new HashMap<>();
                session.parseBody(body);
                String jsonBody = body.get("postData");
                if (jsonBody == null || jsonBody.isEmpty()) {
                    // Try reading input stream directly
                    StringBuilder sb = new StringBuilder();
                    String line;
                    java.io.BufferedReader reader = new java.io.BufferedReader(
                        new java.io.InputStreamReader(session.getInputStream(), "UTF-8")
                    );
                    while ((line = reader.readLine()) != null) sb.append(line);
                    jsonBody = sb.toString();
                }

                // Parse and store the judge score
                String seat = extractJsonValue(jsonBody, "seat");
                if (seat != null) {
                    synchronized (judgeScores) {
                        judgeScores.put(seat, jsonBody);
                    }
                    saveJudgeScores();
                    Log.i(TAG, "Judge score saved for " + seat);
                }

                response = newFixedLengthResponse(Response.Status.OK, "application/json",
                    "{\"status\":\"ok\",\"seat\":\"" + (seat != null ? seat : "unknown") + "\"}");
                response.addHeader("Access-Control-Allow-Origin", "*");
                return response;
            } catch (Exception e) {
                Log.e(TAG, "Error processing judge score", e);
                response = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json",
                    "{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}");
                response.addHeader("Access-Control-Allow-Origin", "*");
                return response;
            }
        }

        // GET judge scores
        if ("/api/judge-scores".equals(uri)) {
            String scoresJson = readJudgeScores();
            response = newFixedLengthResponse(Response.Status.OK, "application/json; charset=utf-8", scoresJson);
            response.addHeader("Access-Control-Allow-Origin", "*");
            return response;
        }

        // GET current match state (includes judge scores)
        if ("/api/state".equals(uri)) {
            String stateJson = readState();
            response = newFixedLengthResponse(Response.Status.OK, "application/json; charset=utf-8", stateJson);
            response.addHeader("Access-Control-Allow-Origin", "*");
            return response;
        }

        // Health check
        if ("/api/ping".equals(uri)) {
            response = newFixedLengthResponse(Response.Status.OK, "application/json", "{\"status\":\"ok\",\"ip\":\"" + getLocalIpAddress() + "\"}");
            response.addHeader("Access-Control-Allow-Origin", "*");
            return response;
        }

        // Redirect shortcuts
        if ("/proj".equals(uri) || "/projection".equals(uri)) {
            uri = "/views/projection.html";
        }
        if ("/access".equals(uri)) {
            uri = "/views/access.html";
        }
        if ("/judge".equals(uri) || "/juez".equals(uri)) {
            uri = "/views/judge.html";
        }

        // Redirect / to index.html
        if ("/".equals(uri)) {
            uri = "/index.html";
        }

        // Serve static files
        File file = new File(wwwDir, uri);
        if (!file.exists()) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "404 - Not Found: " + uri);
        }

        // Security: prevent directory traversal
        try {
            String canonicalPath = file.getCanonicalPath();
            String wwwCanonical = wwwDir.getCanonicalPath();
            if (!canonicalPath.startsWith(wwwCanonical)) {
                return newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "403 - Forbidden");
            }
        } catch (IOException e) {
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "500 - Server Error");
        }

        try {
            FileInputStream fis = new FileInputStream(file);
            String mime = getMimeType(file.getName());
            response = newFixedLengthResponse(Response.Status.OK, mime, fis, (int) file.length());
            response.addHeader("Access-Control-Allow-Origin", "*");
            return response;
        } catch (IOException e) {
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "500 - Server Error");
        }
    }

    private String getMimeType(String fileName) {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    // Judge scores persistence
    private void saveJudgeScores() {
        try {
            File f = new File(context.getCacheDir(), JUDGE_SCORES_FILE);
            StringBuilder sb = new StringBuilder();
            sb.append("{");
            boolean first = true;
            synchronized (judgeScores) {
                for (Map.Entry<String, String> entry : judgeScores.entrySet()) {
                    if (!first) sb.append(",");
                    first = false;
                    sb.append("\"").append(entry.getKey()).append("\":").append(entry.getValue());
                }
            }
            sb.append("}");
            FileOutputStream fos = new FileOutputStream(f);
            fos.write(sb.toString().getBytes("UTF-8"));
            fos.close();
        } catch (IOException e) {
            Log.e(TAG, "Failed to save judge scores", e);
        }
    }

    private String readJudgeScores() {
        try {
            File f = new File(context.getCacheDir(), JUDGE_SCORES_FILE);
            if (!f.exists()) return "{}";
            FileInputStream fis = new FileInputStream(f);
            byte[] data = new byte[(int) f.length()];
            fis.read(data);
            fis.close();
            return new String(data, "UTF-8");
        } catch (IOException e) {
            return "{}";
        }
    }

    public synchronized String getJudgeScoresJson() {
        return readJudgeScores();
    }

    // Simple JSON value extractor (no full parser needed)
    private String extractJsonValue(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start < 0) {
            // Try without quotes (for numbers)
            search = "\"" + key + "\":";
            start = json.indexOf(search);
            if (start < 0) return null;
            start += search.length();
            int end = json.indexOf(",", start);
            if (end < 0) end = json.indexOf("}", start);
            if (end < 0) return null;
            return json.substring(start, end).trim();
        }
        start += search.length();
        int end = json.indexOf("\"", start);
        if (end < 0) return null;
        return json.substring(start, end);
    }
}