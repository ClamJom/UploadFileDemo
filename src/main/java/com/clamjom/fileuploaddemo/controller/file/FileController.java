package com.clamjom.fileuploaddemo.controller.file;

import com.alibaba.fastjson2.JSON;
import com.clamjom.fileuploaddemo.common.FileHandler;
import com.clamjom.fileuploaddemo.entity.Files;
import com.clamjom.fileuploaddemo.entity.PartFile;
import com.clamjom.fileuploaddemo.service.FilesService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Controller;
import org.springframework.util.FileCopyUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
        // 验证
        if(!FileHandler.verifyPartFile(partFile)) return "Failed";
        // 记录文件名与文件ID，并向文件总写入当前片段
        synchronized(redisTemplate){
            String fileId;
            Optional<String> fileOpt = Optional.ofNullable(redisTemplate.opsForValue().get(partFile.getName()));
            if(fileOpt.isEmpty()){
                fileId = UUID.randomUUID().toString();
                redisTemplate.opsForValue().set(partFile.getName(), fileId);
            }else{
                fileId = redisTemplate.opsForValue().get(partFile.getName());
            }
            boolean writeResult = FileHandler.integrationFile(partFile, fileId);
//            boolean writeResult = true;
            if(partFile.getCurrent() == partFile.getTotal() - 1){
                filesService.save(partFile, fileId);
                redisTemplate.delete(partFile.getName());
            }
            if(!writeResult) return "Failed";
        }
        return "OK";
    }

    @GetMapping("/uploaded")
    @ResponseBody
    public String isFileUploaded(@Param("fileName") String fileName){
        Optional<String> fileOpt = Optional.ofNullable(redisTemplate.opsForValue().get(fileName));
        return String.valueOf(fileOpt.isEmpty());
    }

    @GetMapping("/download")
    public void download(@Param("fileName") String fileName, HttpServletRequest request, HttpServletResponse response) throws Exception{
        if(fileName == null || fileName.isEmpty()){
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.getWriter().write("File not found");
            return;
        }
        Files files = filesService.getByName(fileName);
        response.setHeader("content-disposition","attachment;fileName="+ URLEncoder.encode(fileName, StandardCharsets.UTF_8));
        if(files == null){
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.getWriter().write("File not found");
            return;
        }
        File file = new File(files.getPath());
        FileInputStream fis = new FileInputStream(file);
        response.setContentType(files.getFileType());
        FileCopyUtils.copy(fis, response.getOutputStream());
        fis.close();
    }

    @GetMapping("/allFiles")
    @ResponseBody
    public String fileList(){
        return JSON.toJSONString(filesService.getAllFileName());
    }
}
