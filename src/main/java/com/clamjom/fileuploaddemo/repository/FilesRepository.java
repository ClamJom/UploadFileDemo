package com.clamjom.fileuploaddemo.repository;

import com.clamjom.fileuploaddemo.entity.Files;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FilesRepository extends JpaRepository<Files, Long> {

    Files findPartFileById(long id);

    Files findFilesByName(String name);

    boolean existsByName(String name);
}
