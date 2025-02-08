package com.clamjom.fileuploaddemo.common;

import cn.hutool.crypto.digest.DigestUtil;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;

public class Utils {
    public static String getSha256(MultipartFile file) throws IOException {
        if(file == null) return "";
        byte[] bytes = file.getBytes();
        return DigestUtil.sha256Hex(new String(bytes, StandardCharsets.UTF_8),
                "UTF-8").toLowerCase(Locale.ROOT);
    }

    public static String getMd5(MultipartFile file) throws IOException{
        if(file == null) return "";
        byte[] bytes = file.getBytes();
        return DigestUtil.md5Hex(bytes).toLowerCase(Locale.ROOT);
    }
}
