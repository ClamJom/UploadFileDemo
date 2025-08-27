# 文件分段上传Demo

这个项目只是写来玩的，试了试使用Worker来分割文件，然后逐块上传，用于解决大文件的上传问题。目前没有添加断点续传功能，如果上传过程中关闭网页或断开网络将会导致上传失败。如果需要实现这个功能，或许使用Redisson记录已经上传成功的块能够解决？

效果如下：

<video src="./video/demo.mp4"></video>

旧版：

https://github.com/user-attachments/assets/0596ad77-a125-4167-9780-a27a2e82f673
