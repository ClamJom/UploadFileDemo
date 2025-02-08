package com.clamjom.fileuploaddemo.service;

import com.clamjom.fileuploaddemo.common.FileHandler;
import com.clamjom.fileuploaddemo.entity.Files;
import com.clamjom.fileuploaddemo.entity.PartFile;
import com.clamjom.fileuploaddemo.repository.FilesRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;

@Service
public class FilesService {

    @Autowired
    private FilesRepository filesRepository;

    public Files getById(long id){
        return filesRepository.findPartFileById(id);
    }

    public Files getByName(String name){
        return filesRepository.findPartFileByName(name);
    }

    public boolean isExistsById(long id){
        return filesRepository.existsById(id);
    }

    public boolean isExistsByName(String name){
        return filesRepository.existsByName(name);
    }

    public void save(PartFile partFile){
        Files files = null;
        if(this.isExistsByName(partFile.getName())){
            files = this.getByName(partFile.getName());
            files.setModifyTime(partFile.getModifyTime());
        }else{
            files = new Files();
            files.setName(partFile.getName());
            files.setFileType(partFile.getFileType());
            files.setCreateTime(new Date(System.currentTimeMillis()));
            files.setModifyTime(partFile.getModifyTime());
            files.setPath(FileHandler.getFileSavePath() + "/" + files.getName());
        }
        this.save(files);
    }

    public void save(Files files){
        filesRepository.save(files);
    }

    public void delete(Files files){
        filesRepository.delete(files);
    }

    public void update(Files file){
        // 是的，`改`和`存`是一个方法
        filesRepository.save(file);
    }
}
