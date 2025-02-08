package com.clamjom.fileuploaddemo.controller.view;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ViewController {
    @GetMapping("/")
    public String indexView(Model model){
        model.addAttribute("Test", "Hello, Thymeleaf!");
        return "index";
    }
}
