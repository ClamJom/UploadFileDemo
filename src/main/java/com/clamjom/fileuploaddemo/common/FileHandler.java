package com.clamjom.fileuploaddemo.common;

import com.clamjom.fileuploaddemo.entity.PartFile;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;

import java.io.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
@Slf4j
public class FileHandler {
    public static String path;

    @Value("${file.savePath}")
    private String _savePath;

    @PostConstruct
    public void init(){
        path = ClassUtils.getDefaultClassLoader().getResource("").getPath() + _savePath;
    }

    private static final ConcurrentMap<String, String> fileIdMap = new ConcurrentHashMap<>();

    private static final ConcurrentMap<String, List<String>> uploadedPartMap = new ConcurrentHashMap<>();

    public static String getFileId(String fileName){
        String fileId = null;
        if(!fileIdMap.containsKey(fileName)){
            fileId = UUID.randomUUID().toString();
            fileIdMap.put(fileName, fileId);
        }else{
            fileId = fileIdMap.get(fileName);
        }
        return fileId;
    }

    public static void removeFileId(String fileName){
        fileIdMap.remove(fileName);
        uploadedPartMap.remove(fileName);
    }

    public static void uploadedPart(String fileName, String partHash){
        Optional<List<String>> opt = Optional.ofNullable(uploadedPartMap.get(fileName));
        if(opt.isEmpty()){
            uploadedPartMap.put(fileName, new ArrayList<>());
        }
        if(!uploadedPartMap.get(fileName).contains(partHash))
            uploadedPartMap.get(fileName).add(partHash);
    }

    public static List<String> getUploadedParts(String fileName){
        Optional<List<String>> opt = Optional.ofNullable(uploadedPartMap.get(fileName));
        if(opt.isEmpty()){
            return new ArrayList<>();
        }
        return uploadedPartMap.get(fileName);
    }

    public static void clearUploadedParts(String fileName){
        uploadedPartMap.remove(fileName);
    }

    /**
     * 通过Md5验证片段
     * @param partFile 片段
     * @return 验证结果
     * @throws IOException 由HuTool抛出，当生成MD5错误时会抛出IO错误
     */
    public static boolean verifyPartFile(PartFile partFile) throws IOException {
        return partFile.getMd5().equalsIgnoreCase(Utils.getMd5(partFile.getPart()));
    }

    /**
     * 获取文件存储路径
     * @return 文件存储路径
     */
    public static String getFileSavePath(){
        File uploadFilePath = new File(path);
        if(!uploadFilePath.exists()){
            if(!uploadFilePath.mkdirs()) return null;
        }
        return uploadFilePath.getAbsolutePath();
    }

    /**
     * 获取缓存路径
     * @return 缓存路径
     */
    public static String getCachePath(){
        File uploadFileParentPath = new File(path + "\\cache");
        if(!uploadFileParentPath.exists()){
            // `mkdirs`会创建所有缺失的父目录
            if(!uploadFileParentPath.mkdirs()) return null;
        }
        return uploadFileParentPath.getAbsolutePath();
    }

    @Deprecated
    public static String savePartFile(PartFile partFile, String fileUUID) {
        try {
            String partFileName = FileHandler.getCachePath() + "\\" + fileUUID + "_" + partFile.getCurrent() + ".data";
            File uploadFile = new File(partFileName);
            partFile.getPart().transferTo(uploadFile);
            return partFileName;
        }catch(Exception e){
            log.error(e.toString());
            return null;
        }
    }

    /**
     * 整合文件。通过文件片段路径列表获取片段，并整合至指定的文件路径
     * @param id 文件ID
     * @param name 保存的文件名，最终会保存至指定路径
     * @return 保存的结果
     */
    @Deprecated
    public static boolean integrationFileParts(String id, String name, int total){
        try{
            // 这里没有判断是否存在父目录是因为所有文件都会生成片段，在生成片段时已经有过判断
            String savePath = path + "/" + name;
            File saveFile = new File(savePath);
            // 如果已经上传过则忽略
            if(saveFile.exists()){
                for(int i = 0; i < total; i++) {
                    String partPath = FileHandler.getCachePath() + "\\" + id + "_" + i + ".data";
                    File partFile = new File(partPath);
                    if(!partFile.exists()) continue;
                    partFile.delete();
                }
                return true;
            }
            OutputStream out = new FileOutputStream(saveFile);
            for(int i = 0; i < total; i++){
                String partPath = FileHandler.getCachePath() + "\\" + id + "_" + i + ".data";
                File partFile = new File(partPath);
                if(!partFile.exists()) {
                    // 文件片段不存在时应当及时关闭文件写入，否则会长时间锁定文件
                    out.close();
                    saveFile.delete();
                    return false;
                }
                InputStream input = new FileInputStream(partFile);
                out.write(input.readAllBytes());
                input.close();
                partFile.delete();
            }
            out.close();
        }catch(Exception e) {
            log.error(e.toString());
            return false;
        }
        return true;
    }

    public static boolean integrationFile(PartFile partFile, String ID){
        RandomAccessFile aimFile = null;
        try{
            aimFile = new RandomAccessFile(FileHandler.getFileSavePath() + "/" + ID + ".saved", "rw");
//            log.info(FileHandler.getFileSavePath());
            aimFile.seek(partFile.getCurrent() * partFile.getPartSize());
            aimFile.write(partFile.getPart().getBytes());
            return true;
        }catch(Exception e){
            log.error(e.getMessage());
            return false;
        }finally {
            if(aimFile != null)
                try {
                    aimFile.close();
                }catch(Exception e){
                    log.error(e.getMessage());
                }
        }
    }

    public static void deleteByPath(String path){
        try{
            File aim = new File(path);
            aim.delete();
        }catch(Exception e){
            return;
        }
    }
}
