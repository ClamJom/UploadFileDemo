package com.clamjom.fileuploaddemo.controller.file;

import com.alibaba.fastjson2.JSON;
import com.clamjom.fileuploaddemo.common.FileHandler;
import com.clamjom.fileuploaddemo.entity.Files;
import com.clamjom.fileuploaddemo.entity.PartFile;
import com.clamjom.fileuploaddemo.service.FilesService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RMap;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

@Controller
@Slf4j
public class FileController {
    @Autowired
    private FilesService filesService;

    @Autowired
    private RedissonClient redissonClient;

    @PostMapping("/upload")
    @ResponseBody
    public String uploadFile(PartFile partFile) throws IOException, ExecutionException, InterruptedException {
        // 验证
        if(!FileHandler.verifyPartFile(partFile)) return "Failed";
        // 记录文件名与文件ID，并向文件总写入当前片段
        String fileId;
        RMap<String, String> redissonMap = redissonClient.getMap(partFile.getName());
        if(!redissonMap.containsKey(partFile.getName())){
            fileId = UUID.randomUUID().toString();
            redissonMap.put(partFile.getName(), fileId);
            redissonMap.expire(24, TimeUnit.HOURS);
        }else{
            fileId = redissonMap.get(partFile.getName());
        }
        boolean writeResult = FileHandler.integrationFile(partFile, fileId);
        if(partFile.getCurrent() == partFile.getTotal() - 1){
            filesService.save(partFile, fileId);
            redissonMap.remove(partFile.getName());
        }
        if(!writeResult) return "Failed";
        return "OK";
    }

    @PostMapping("/uploadXml")
    @ResponseBody
    public String uploadFileInXml(@RequestParam("file") MultipartFile file) throws IOException{
//        MultipartFile file = param.get("file");
        assert file != null;
        String filename = file.getName();
        log.info(filename);
        String path = FileHandler.getFileSavePath() + "/" + filename;
        File fileObj = new File(path);
        file.transferTo(fileObj);
        return "OK";
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
        if(!file.exists()){
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.getWriter().write("File was been deleted by server.");
            filesService.delete(files);
            return;
        }
        FileInputStream fis = new FileInputStream(file);
        response.setContentType(files.getFileType());
        FileCopyUtils.copy(fis, response.getOutputStream());
        fis.close();
    }

    @DeleteMapping("/delete")
    @ResponseBody
    public String deleteFile(@Param("filename") String filename){
        Files files = filesService.getByName(filename);
        Optional<Files> fileOpt = Optional.ofNullable(files);
        if(fileOpt.isEmpty()){
            return "File not found";
        }
        File file = new File(files.getPath());
        if(!file.exists()){
            return "File was already been deleted by server.";
        }
        file.delete();
        filesService.delete(files);
        return "OK";
    }

    @GetMapping("/allFiles")
    @ResponseBody
    public String fileList(){
        return JSON.toJSONString(filesService.getAllFileName());
    }
}
