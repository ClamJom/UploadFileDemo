package com.clamjom.fileuploaddemo.controller.file;

import com.clamjom.fileuploaddemo.common.FileHandler;
import com.clamjom.fileuploaddemo.entity.PartFile;
import com.clamjom.fileuploaddemo.service.FilesService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

@Controller
@Slf4j
public class FileController {
    @Autowired
    private FilesService filesService;

    @Autowired
    private volatile RedisTemplate<String, String> redisTemplate;

    @PostMapping("/upload")
    @ResponseBody
    public String uploadFile(PartFile partFile) throws IOException {
        synchronized (redisTemplate) {
            // 验证
            if (!FileHandler.verifyPartFile(partFile)) return "Verify Failed";

            String fileId;

            Optional<String> fileNameOpt = Optional.ofNullable(redisTemplate.opsForValue().get(partFile.getName()));

            if (fileNameOpt.isEmpty()) {
                fileId = UUID.randomUUID().toString();
                redisTemplate.opsForValue().set(partFile.getName(), fileId);
            } else {
                fileId = redisTemplate.opsForValue().get(partFile.getName());
            }

            // 保存
            String partFileSavedPath = FileHandler.savePartFile(partFile, fileId);
            Optional<String> opt = Optional.ofNullable(partFileSavedPath);
            if (opt.isEmpty()) return "Save Part Failed";
            // 整合
            if (partFile.getCurrent() == partFile.getTotal() - 1) {
                if (!FileHandler.integrationFileParts(fileId, partFile.getName(), partFile.getTotal())) {
                    return "Integration Failed";
                }
                filesService.save(partFile);
                // 整合完成后应当删除缓存
                redisTemplate.delete(partFile.getName());
            }
            return "OK";
        }
    }
}
