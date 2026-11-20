package com.teo.wordbook;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.ImageDecoder;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;

// 클립보드에 복사된 이미지와, 다른 앱에서 공유한 이미지를 웹 화면으로 넘긴다.
@CapacitorPlugin(name = "ClipboardImage")
public class ClipboardImagePlugin extends Plugin {

    private static final int MAX_SIDE = 1600;

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
            String data = readBase64(uri);
            result.put("data", data);
            result.put("mimeType", mimeType);
            // 크롬은 복사할 때마다 같은 주소에 그림을 덮어써서, 주소만으로는 새 그림인지 알 수 없다.
            result.put("signature", uri + "#" + data.length() + ":" + data.hashCode());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("클립보드 이미지를 읽지 못했어요.", error);
        }
    }

    // 웹뷰가 못 여는 그림(갤럭시 카메라의 HEIC 등)을 안드로이드 디코더로 열어 JPEG로 바꿔 준다.
    @PluginMethod
    public void toJpeg(PluginCall call) {
        String data = call.getString("data");
        if (data == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("그림을 바꾸지 못했어요.");
            return;
        }
        new Thread(() -> {
            try {
                ImageDecoder.Source source = ImageDecoder.createSource(ByteBuffer.wrap(Base64.decode(data, Base64.DEFAULT)));
                Bitmap bitmap = ImageDecoder.decodeBitmap(source, (decoder, info, ignored) -> {
                    int width = info.getSize().getWidth();
                    int height = info.getSize().getHeight();
                    float scale = Math.min(1f, MAX_SIDE / (float) Math.max(width, height));
                    decoder.setTargetSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
                    decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                });
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, output);
                bitmap.recycle();
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                call.resolve(result);
            } catch (Exception error) {
                call.reject("그림을 바꾸지 못했어요.", error);
            }
        }).start();
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
