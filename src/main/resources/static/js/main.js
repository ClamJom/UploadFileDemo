class UploadRecord{

    #uploadRecord;
    #enableUpload;

    constructor() {
        this.#uploadRecord = [];
        this.#enableUpload = true;
    }

    /**
     * 添加记录
     * @param fileId :string 文件ID
     * @param data :[object] 数据块列表
     * @param handleDataUpload :function
     */
    async addUploadRecord(fileId, data, handleDataUpload){
        this.#uploadRecord = this.#uploadRecord.filter(record=>{
            return record.id !== fileId;
        });
        const newRecord = {
            id: fileId, // 文件ID
            uploadedParts:[], // 已上传的文件片段下标列表
            uploadFunc: handleDataUpload,
            data: data,     // 片段数据、MD5值列表
            total: data.length, // 总片段数量
            startTime: new Date() // 传输创建时间
        }
        this.#uploadRecord.push(newRecord);
        window.sessionStorage.setItem(fileId, "[]");
        return newRecord;
    }

    async deleteUploadRecord(fileId){
        this.#uploadRecord = this.#uploadRecord.filter((record)=>{
            return record.id !== fileId;
        });
        if(window.sessionStorage.getItem(fileId)){
            window.sessionStorage.removeItem(fileId);
        }
    }

    async updatePartsState(fileId, partIndex){
        this.#uploadRecord.forEach((record)=>{
            if(record.id === fileId){
                record.uploadedParts.push(partIndex);
                window.sessionStorage.setItem(fileId, JSON.stringify(record.uploadedParts));
            }
        });
    }

    async readRecord(fileId){
        const recordList = this.#uploadRecord.filter(record=> record.id === fileId);
        if(recordList.length === 0)return undefined;
        return recordList[0];
    }

    async readRecordState(fileId){
        const record = await this.readRecord(fileId);
        if(record === undefined){
            let states = window.sessionStorage.getItem(fileId);
            if(!states) return [];
            else return JSON.parse(states);
        }else{
            return record.uploadedParts;
        }
    }

    async setUploadingState(state){
        if(!this.#enableUpload){
            // 处理开始上传
            this.#uploadRecord.forEach(record=>{
                record.uploadFunc(record.data);
            });
        }
        this.#enableUpload = state;
    }

    getUploadingState() {return this.#enableUpload;}
}

let mainRecord = new UploadRecord();

getAllFiles();

/**
 * 生成UUID
 * @returns {string} UUID
 */
function UUID(){
    return 'xxxxxxxx-xxxx-xxxx-xfxx-xxxxdxxxxxxx'.replace(/x/g, function (c) {
        let r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 上传入口，从"#file"元素中读取文件上传
 */
function uploadFile(){
    let aim = document.querySelector("#file");
    const files = aim.files;
    for(let file of files){
        handleUpload("/upload", file, 1024 * 1024);
    }
}

function uploadXml(){
    let aim = document.querySelector("#fileXml");
    const files = aim.files;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/uploadXml", true);
    // xhr.setRequestHeader("Content-Type", "multipart/form-data");
    for(let file of files){
        const partElements = initPartElements(UUID(), file, 1024 * 1024);
        xhr.upload.onprogress = (e)=>{
            const loaded = e.loaded;
            const total = e.total;
            const percentage = loaded / total;
            for(let i = 0; i <= partElements.length; i++){
                if(i / partElements.length < percentage){
                    partElements[i].classList.add("ok");
                }
            }
        }
        const formData = new FormData();
        formData.append("file", file);
        xhr.send(formData);
    }
}

/**
 * 生成
 * @param id
 * @param file
 * @param chunkSize
 * @returns {*[]}
 */
function initPartElements(id, file, chunkSize){
    let previewContainer = document.querySelector("#preview");
    let total = Math.ceil(file.size / chunkSize);
    let el = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    el.innerText = file.name;
    el.id = id;
    el.classList.add("preview_common");
    // el.onclick = () => removeCommonPreview(id);
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
 * @param concurrentThreshold :number 并发上传数据大小阈值，这会决定最多有多少个块并发，默认为10M。并发块数 = 该阈值 / 片段大小
 */
function handleUpload(url, file,
                      chunkSize= 1024 * 1024,
                      concurrentSize = 10,
                      concurrentThreshold = 10 * 1024 * 1024)
{
    // 创建Worker，用于分割片段与片段Md5摘要生成
    let worker = new Worker("/js/worker.js");
    let id = UUID();    //文件ID
    let name = file.name;   //文件名
    let type = file.type;   // 文件类型
    let total = Math.ceil(file.size / chunkSize);   // 总片段数
    let partElements = initPartElements(id, file, chunkSize);    // 状态块，渲染在前端的DOM元素，用于展示小块的上传状态

    // 片段上传核心
    const uploadCore = async (chunkHashData, index) => new Promise((res, rej)=>{
        // 小块的上传核心，使用Promise封装。封装每一个小块的数据并使用fetch上传，返回上传结果
        // 构建FormData上传文件及其相关参数
        const formData = new FormData();
        formData.append("name", name);
        formData.append("part", chunkHashData.chunk);
        formData.append("total", total.toString());
        formData.append("current", index.toString());
        formData.append("md5", chunkHashData.hash);
        formData.append("fileType", type);
        formData.append("partSize", chunkSize.toString());
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
            rej({
                id: id,
                index: index,
                state: "Error"
            });
        });
    });

    // 文件开始上传回调
    function HandleStartUpload(){}

    // 文件上传停止回调
    function HandleStopUpload(msg){
        getAllFiles();
    }

    // 块上传开始回调
    function HandleBlockStartUpload(record, blockIndex){}

    // 块上传停止回调
    function HandleBlockStopUpload(record, blockIndex){}

    // 片段开始上传回调
    function HandlePartStartUpload(record, index){
        partElements[index].classList.add("uploading");
    }

    // 片段上传响应回调
    function HandleResponse(record, data){
        partElements[data.index].classList.add(
            data.state === "OK" ? 'ok' : 'error'
        );
    }

    /**
     * 文件分块处理后的回调，处理并发上传大块的逻辑
     * @param data :Array
     */
    const uploadBlocks = async (data) => {
        HandleStartUpload();
        // 获取已上传的片段
        const states = await mainRecord.readRecordState(id);
        // 获取当前记录
        let currentRecord = null;
        mainRecord.readRecord(id).then(record=>{
            if(!record){
                mainRecord.addUploadRecord(id, data, uploadBlocks).then(newRecord=>{
                    currentRecord = newRecord;
                    currentRecord.data = data;
                });
            }else{
                currentRecord = record;
                // 将记录的数据更改为当前的数据
                currentRecord.data = data;
            }
        });
        // 获取最后一块，最后一块应当最后上传
        const lastPart = data[data.length - 1];
        // 构建剩余片段与原片段列表下标的映射
        const index2OriginIdx = {};
        // 记录剩余片段数量
        let leftSize = 0;
        // 生成剩余片段列表
        const leftParts = data.filter((part, index)=>{
            const isUploaded = states.indexOf(index) !== -1;
            if(!isUploaded){
                index2OriginIdx[leftSize] = index;
                leftSize++;
            }
            return !isUploaded;
        });
        if(leftSize === 0) return;

        // 生成并发块任务池
        const taskPool = [];
        for(let taskIdx = 0; taskIdx <= Math.ceil(leftSize / concurrentSize); taskIdx++){
            // 创建块，其本质是一个封装的Promise。直接`new Promise`会导致其立即执行，因此封装至函数中
            const currentTask = async () => new Promise((res, rej)=>{
                // 块用于处理其中的片段，块总的片段是同步上传的，块与块之间是并发（异步）上传的，大文件稍有不同
                let currentIdx = taskIdx * concurrentSize;
                // 块处理核心函数，用于同步执行片段上传
                function subUploadFunc(currentIdx){
                    if(currentIdx === taskIdx * concurrentSize){
                        HandleBlockStartUpload(currentRecord, taskIdx);
                    }
                    // 认为：下标越界时 或 在块尾时 或 当前片段为所有片段的最后一块片段时，当前块处理完成，应当处理当前Promise
                    if(currentIdx >= leftSize || currentIdx >= (taskIdx + 1) * concurrentSize || leftParts[currentIdx].hash === lastPart.hash){
                        res();
                        HandleBlockStopUpload(currentRecord, taskIdx);
                        return;
                    }
                    // 当暂停时，选择拒绝当前Promise
                    if(!mainRecord.getUploadingState()){
                        rej("Paused");
                        HandleBlockStopUpload(currentRecord, taskIdx);
                        return;
                    }
                    // 开始上传回调
                    HandlePartStartUpload(currentRecord, index2OriginIdx[currentIdx]);
                    uploadCore(leftParts[currentIdx], index2OriginIdx[currentIdx]).then((resp)=>{
                        // 响应回调
                        HandleResponse(currentRecord, resp);
                        // 上传成功时更新片段状态
                        mainRecord.updatePartsState(id, index2OriginIdx[currentIdx]);
                        // 继续传输下一片段
                        currentIdx++;
                        subUploadFunc(currentIdx);
                    }).catch((err)=>{
                        HandleResponse(currentRecord, err);
                        rej(err);
                    });
                }
                // 开始执行块处理
                subUploadFunc(currentIdx);
            });
            taskPool.push(currentTask);
        }
        // 同时支持10M片段上传
        let thresholdPoolSize = Math.ceil((concurrentThreshold) / chunkSize);
        if(leftSize < thresholdPoolSize) {
            // 当前文件小于10M时，直接上传
            const taskBlockPool = [];
            taskPool.forEach((task)=>{
                taskBlockPool.push(task());
            });
            Promise.all(taskBlockPool).then(() => {
                uploadCore(lastPart, total - 1).then(res => {
                    HandleResponse(currentRecord, res);
                    HandleStopUpload("Done");
                    mainRecord.deleteUploadRecord(id).then();
                });
            }).catch(e=>{
                HandleStopUpload(e);
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
                        uploadCore(lastPart, total - 1).then(res => {
                            HandleResponse(currentRecord, res);
                            HandleStopUpload("Done");
                            mainRecord.deleteUploadRecord(id).then();
                        });
                    }
                }).catch(e=>{
                    HandleStopUpload(e);
                });
            }
            blockUpload(0);
        }
    }

    // 向Worker通信，通知其开始分割文件并计算片段MD5
    worker.postMessage({file: file, chunkSize: chunkSize});
    // 将文件分块后，将最后一块作为整合信号，在所有的部分传输完成之后传输
    worker.onmessage = (e)=>{
        // e.data.length返回的值可能是0，只有当结果正确时才开始上传
        if(e.data.length >= total){
            uploadBlocks(e.data).then();
            worker.terminate();
        }
    }
}

function getAllFiles(){
    fetch("/allFiles").then(res=>res.json()).then(res=>{
        let fileListContainer = document.querySelector("#fileList");
        fileListContainer.innerHTML = "";
        for(let file of res){
            let newChild = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
            let childLink = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
            childLink.href = `/download?fileName=${file}`;
            childLink.innerText = file;
            newChild.appendChild(childLink);
            fileListContainer.appendChild(newChild);
        }
    });
}

// 通过消息生成SHA-256摘要
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
 * 使用SHA-256生成片段上传文件
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
    let el = document.getElementById(id);
    if(!el) return;
    el.remove();
}
