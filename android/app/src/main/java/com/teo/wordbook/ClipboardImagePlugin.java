package com.teo.wordbook;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

// 클립보드에 복사된 이미지와, 다른 앱에서 공유한 이미지를 웹 화면으로 넘긴다.
@CapacitorPlugin(name = "ClipboardImage")
public class ClipboardImagePlugin extends Plugin {

    private static ClipboardImagePlugin instance;
    private static Uri pendingShare;

    @Override
    public void load() {
        instance = this;
        if (pendingShare != null) {
            emitShared(pendingShare);
            pendingShare = null;
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        JSObject result = new JSObject();
        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) {
            call.resolve(result);
            return;
        }
        Uri uri = clip.getItemAt(0).getUri();
        String mimeType = uri == null ? null : getContext().getContentResolver().getType(uri);
        if (mimeType == null || !mimeType.startsWith("image/")) {
            call.resolve(result);
            return;
        }
        try {
            result.put("data", readBase64(uri));
            result.put("mimeType", mimeType);
            result.put("signature", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("클립보드 이미지를 읽지 못했어요.", error);
        }
    }

    static void notifyFocus() {
        if (instance != null) instance.notifyListeners("windowFocus", new JSObject());
    }

    static void handleShare(Uri uri) {
        if (instance == null) {
            pendingShare = uri;
            return;
        }
        instance.emitShared(uri);
    }

    // 큰 그림 파일을 화면 스레드에서 읽으면 앱이 멈추므로 따로 읽는다.
    private void emitShared(Uri uri) {
        new Thread(() -> emitSharedNow(uri)).start();
    }

    private void emitSharedNow(Uri uri) {
        try {
            JSObject image = new JSObject();
            image.put("data", readBase64(uri));
            String mimeType = getContext().getContentResolver().getType(uri);
            image.put("mimeType", mimeType == null ? "image/jpeg" : mimeType);
            notifyListeners("sharedImage", image, true);
        } catch (Exception ignored) {
            // 읽을 수 없는 공유는 무시한다. 사용자는 갤러리에서 다시 고를 수 있다.
        }
    }

    private String readBase64(Uri uri) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int read;
            while (input != null && (read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        }
    }
}
