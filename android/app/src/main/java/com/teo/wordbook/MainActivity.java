package com.teo.wordbook;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ClipboardImagePlugin.class);
        super.onCreate(savedInstanceState);
        // 화면이 다시 만들어질 때는 이미 처리한 공유를 또 받지 않는다.
        if (savedInstanceState == null) handleShareIntent(getIntent());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) ClipboardImagePlugin.notifyFocus();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return;
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) ClipboardImagePlugin.handleShare(uri);
    }
}
