let fileList = [];

function UUID(){
    return 'xxxxxxxx-xxxx-xxxx-xfxx-xxxxdxxxxxxx'.replace(/x/g, function (c) {
        let r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function uploadFile(){
    let aim = document.querySelector("#file");
    let files = aim.files;
    for(let file of files){
        // addToPreview(file);
        handleUpload("/upload", file, 1024 * 1024);
    }
}

function initBlock(id, file, chunkSize){
    let previewContainer = document.querySelector("#preview");
    let total = Math.ceil(file.size / chunkSize);
    let el = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    el.innerText = file.name;
    el.id = id;
    el.classList.add("preview_common");
    el.onclick = () => removeCommonPreview(id);
    previewContainer.appendChild(el);

    let stateContainer = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    stateContainer.classList.add("preview_state");
    el.appendChild(stateContainer)

    let blockList = []
    for(let i = 0;i < total;i++){
        let stateBlock = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        stateBlock.classList.add("upload_state_block");
        stateContainer.appendChild(stateBlock);
        blockList.push(stateBlock);
    }
    return blockList;
}

/**
 *
 * @param url :string 上传地址
 * @param file :File input:file中的value值
 * @param chunkSize :number 片段大小（单位为Byte），默认为1M
 * @param concurrentSize :number 并发块大小（一个并发块中含有多少个片段），默认为10
 */
function handleUpload(url, file, chunkSize= 1024 * 1024, concurrentSize = 10){
    // 创建Worker，用于分割片段与片段Md5摘要生成
    let worker = new Worker("/js/worker.js");
    let id = UUID();    //片段ID
    let name = file.name;   //文件名
    let type = file.type;   // 文件类型
    let modifyTime = new Date(file.lastModified);   // 修改时间
    let total = Math.ceil(file.size / chunkSize);   // 总片段数
    let blocks = initBlock(id, file, chunkSize);    // 状态块，渲染在前端的DOM元素，用于展示小块的上传状态
    const uploadCore = async (chunkHashData, index) => new Promise(res=>{
        // 小块的上传核心，使用Promise封装。封装每一个小块的数据并使用fetch上传，返回上传结果
        // 构建FormData上传文件及其相关参数
        const formData = new FormData();
        formData.append("name", name);
        formData.append("part", chunkHashData.chunk);
        formData.append("total", total.toString());
        formData.append("current", index.toString());
        formData.append("md5", chunkHashData.hash);
        formData.append("fileType", type);
        formData.append("modifyTime", modifyTime.toString());
        fetch(url, {
            method: "POST",
            body: formData
        }).then(response=> response.text()).then(data=> {
            res({
                id: id,
                index: index,
                state: data
            });
        }).catch(()=>{
            res({
                id: id,
                index: index,
                state: "Error"
            });
        });
    })
    worker.postMessage({file: file, chunkSize: chunkSize});
    // 将文件分块后，将最后一块作为整合信号，在所有的部分传输完成之后传输
    // TODO: 断点重传
    worker.onmessage = (e)=>{
        // e.data.length返回的值可能是0，只有当结果正确时才开始上传
        if(e.data.length >= total){
            // 存放并发片段
            let taskPool = [];
            for(let taskIdx = 0 ; taskIdx <= Math.ceil((total - 1) / concurrentSize); taskIdx++){
                // 构造并发片段
                const currentTask = async () => new Promise((res)=>{
                   // 将大块并发上传
                    let currentIdx = taskIdx * concurrentSize < total - 1 ? taskIdx * concurrentSize : total - 1;
                    function subUploadFunc(currentIdx){
                        // 闭包函数，将同一大块中的小块同步上传
                        if(currentIdx === total - 1){
                            // 最后一块用于整合文件，因此不在此处上传，应当等到所有的部分全部上传完毕后再上传该部分，
                            // 否则后端会出现并发同步问题
                            // TIP: 这个问题主要是因为最后一块的大小只会小于或等于其它部分的的大小，可能会优先于其
                            // 它块传递完成，导致由于整合信号提前被收到，有部分片段缺失而无法整合文件
                            // TODO: 将后端接收文件对象改为RandomAccessFile解决并发同步问题
                            res();
                            return;
                        }
                        // 单个片段上传不一定是瞬间完成的，因此添加中间态表示已经开始上传
                        blocks[currentIdx].classList.add("uploading")
                        uploadCore(e.data[currentIdx], currentIdx).then((resp)=>{
                            // 上传完成后移除“正在上传”状态
                            blocks[currentIdx].classList.remove("uploading");
                            // 渲染上传结果
                            blocks[currentIdx].classList.add(
                                resp.state === "OK" ? "ok" : "error"
                            );
                            currentIdx++;
                            if(currentIdx >= total - 1 || currentIdx >= (taskIdx + 1) * concurrentSize){
                                res();
                            }else{
                                // 当大块总还有其它小块时，继续上传
                                subUploadFunc(currentIdx);
                            }
                        });
                    }
                    subUploadFunc(currentIdx);
                });
                taskPool.push(currentTask);
            }
            // 同时支持10M片段上传
            let thresholdPoolSize = Math.ceil((10 * 1024 * 1024) / chunkSize);
            if(taskPool.length < thresholdPoolSize) {
                // 当前文件小于10M时，直接上传
                const taskBlockPool = [];
                taskPool.forEach((task)=>{
                    taskBlockPool.push(task());
                });
                Promise.all(taskBlockPool).then(() => {
                    uploadCore(e.data[total - 1], total - 1).then(res => {
                        blocks[total - 1].classList.add(
                            res.state === "OK" ? "ok" : "error"
                        );
                    });
                });
            }else{
                // 当前文件大于10M时，每次上传10M直至上传完成
                function blockUpload(startIndex){
                    const taskBlockPool = [];
                    taskPool.slice(startIndex, startIndex + thresholdPoolSize).forEach((task)=>{
                        taskBlockPool.push(task());
                    });
                    Promise.all(taskBlockPool).then(()=>{
                        if(startIndex + thresholdPoolSize < taskPool.length){
                            blockUpload(startIndex + thresholdPoolSize);
                        }else{
                            uploadCore(e.data[total - 1], total - 1).then(res => {
                                blocks[total - 1].classList.add(
                                    res.state === "OK" ? "ok" : "error"
                                );
                            });
                        }
                    });
                }
                blockUpload(0);
            }
            worker.terminate();
        }
    }
}

async function digestMessage(message) {
    const msgUint8 = new TextEncoder().encode(message); // 编码为（utf-8）Uint8Array
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8); // 计算消息的哈希值
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // 将缓冲区转换为字节数组
     // 将字节数组转换为十六进制字符串
    return hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("").toLowerCase();
}

/**
 *
 * @param url :string,
 * @param file :File
 * @param partSize :number
 */
async function handleUploadHashSha256(url, file, partSize= 1024 * 1024){
    let total = Math.ceil(file.size / partSize);
    let currentIndex = 0;
    let reader = new FileReader();
    reader.onload = async function (e){
        let chunk = e.target.result;
        const sha256 = await digestMessage(chunk);
        const formData = new FormData();
        formData.append("name", file.name);
        formData.append("part", new Blob([chunk]));
        formData.append("total", total.toString());
        formData.append("current", currentIndex.toString());
        formData.append("sha256", sha256);
        formData.append("fileType", file.type);
        formData.append("modifyTime", new Date(file.lastModified));

        fetch(url, {
            method: "POST",
            body: formData
        }).then(rsp=>rsp.text())
            .then(data=>{
            console.log(data);
            currentIndex++;
            if(currentIndex < total) readNextChunk();
        })
    }

    function readNextChunk(){
        const start = currentIndex * partSize;
        const end = Math.min(start + partSize, file.size);
        const blob = file.slice(start, end);
        reader.readAsBinaryString(blob);
    }

    readNextChunk();
}

/**
 *
 * @param src :string, base64 或 url
 * @returns {string}
 */
function addImagePreview(src){
    let previewContainer = document.querySelector("#preview");
    let id = UUID();
    let imgEl = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
    imgEl.id = id;
    imgEl.src = src;
    imgEl.classList.add("preview_image")
    imgEl.onclick = () => removeImagePreview(id);
    previewContainer.appendChild(imgEl);
    return id;
}

function removeImagePreview(id){
    fileList = fileList.filter((fId)=>{
        return fId !== id;
    });
    let imgEl = document.getElementById(id);
    if(!imgEl) return;
    imgEl.remove();
}

function addCommonPreview(name){
    let previewContainer = document.querySelector("#preview");
    let id = UUID();
    let el = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    el.innerText = name;
    el.id = id;
    el.classList.add("preview_common");
    el.onclick = () => removeCommonPreview(id);
    previewContainer.appendChild(el);
    return id;
}

function removeCommonPreview(id){
    fileList = fileList.filter((fId)=>{
        return fId !== id;
    });
    let el = document.getElementById(id);
    if(!el) return;
    el.remove();
}
