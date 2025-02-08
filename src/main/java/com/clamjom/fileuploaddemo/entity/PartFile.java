package com.clamjom.fileuploaddemo.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.web.multipart.MultipartFile;

import java.util.Date;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PartFile {

    private String name;

    private String path;

    private MultipartFile part;

    private int total;

    private int current;

    private long partSize;

    private String md5;

    private String fileType;

    private Date modifyTime;

    private Date createTime;
}
