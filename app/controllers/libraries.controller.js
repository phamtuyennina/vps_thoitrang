const { librariesModel, usersModel } = require("../models")
const { ErrorHandler, Functions, ApiFeatures } = require("../helpers")
const catchAsyncErrors = require("../middlewares/catchAsyncErrors")
const bcrypt = require("bcrypt")
const pathRoot = require("path")
var CryptoJS = require("crypto-js")
var fs = require("fs");
const util = require("util");
const jwt = require('jsonwebtoken')
const multer = require('multer');
const uuid = require('uuid');
const multiparty = require('multiparty');
const fsExtra = require('fs-extra');
const readdir = util.promisify(fs.readdir);
const unlink = util.promisify(fs.unlink);
var mime = require('mime-types')

const TMP_DIR = pathRoot.join(__dirname, "../../media/tmp");
const UPLOAD_DIR = pathRoot.join(__dirname, "../../media");
const IGNORES = [".DS_Store"];


const uploadPath = pathRoot.join(__dirname, '../../media/userp'); // Register the upload path
fsExtra.ensureDir(uploadPath);


async function concatFiles(sourceDir, targetPath) {
    const readFile = (file, ws) =>
        new Promise((resolve, reject) => {
        fs.createReadStream(file).on("data", (data) => ws.write(data)).on("end", resolve).on("error", reject);
    });
    const files = await readdir(sourceDir);
    const sortedFiles = files.filter((file) => { return IGNORES.indexOf(file) === -1; }).sort((a, b) => a - b);
    const writeStream = fs.createWriteStream(targetPath);
    for (const file of sortedFiles) {
        let filePath = pathRoot.join(sourceDir, file);
        await readFile(filePath, writeStream);
        await unlink(filePath);
    }
    writeStream.end();
}

module.exports = {
    uploadMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            // console.log(`Here is a test v4 uuid: ${uuid.v4()}`);
            // return false;
            const queryStr = req.query
            let rowFolder = null;

            if(queryStr.folder!=null && queryStr.parentId!=null){
                rowFolder = await folderModel.findOne({ 
                    "$or": [{"name": { $eq: queryStr.folder }}, {"slug": { $eq: queryStr.folder }}], 
                    "_id": queryStr.parentId
                });
                if(!rowFolder){ return next(new ErrorHandler(false, req.__("The selected folder could not be found"), 500)); }
            } else{
                if(queryStr.folder){
                    rowFolder = await folderModel.findOne({ "$or": [{"name": { $eq: queryStr.folder }}, {"slug": { $eq: queryStr.folder }}], "level": { $eq: 1 } });
                    if(!rowFolder){
                        return next(new ErrorHandler(false, req.__("The selected folder could not be found"), 500));
                    }
                }else{
                    if(!queryStr.parentId){
                        return next(new ErrorHandler(false, req.__("Params [%s] cannot be empty","parentId"), 500));
                    }
                    rowFolder = await folderModel.findOne({ "_id": queryStr.parentId });
                    if(!rowFolder){
                        return next(new ErrorHandler(false, req.__("The selected folder could not be found"), 500));
                    }
                }
            }
            
            const path = rowFolder.path;
            const message = req.__('Only media files are allowed %s', '[' + process.env.MINE_TYPE_FILES + ']!')
            const storage = multer.diskStorage({
                destination: function (req, file, cb) {
                    cb(null,path)
                },
                filename: async function (req, file, cb) {
                    const resultFilter = await librariesModel.findOne({filename: { $eq: file.originalname } })
                    if(resultFilter){
                        const filename = Date.now() + '-' + Math.round(Math.random() * 1E9)
                        cb(null, filename + '-' +file.originalname)
                    }else{
                        cb(null, file.originalname )
                    }
                }
            })
            var listMediaError = []
            const imageFilter = function (req, file, cb) {
                var ext = pathRoot.extname(file.originalname).slice(1);
                var default_ext = process.env.MINE_TYPE_FILES.split('|');
                if(parseInt(default_ext.indexOf(ext)) == -1){
                    req.fileValidationError = message
                    listMediaError.push(file);
                    cb(null, false)
                }
                cb(null, true);
            };
            let uploadMultipleFiles = multer({ storage: storage, fileFilter: imageFilter }).array('files', process.env.LIMIT_FILES);
            uploadMultipleFiles(req, res ,function(err) {
                var files = req.files, listMedia = []
                files.forEach(async (ele, index) => {
                    var ext = pathRoot.extname(ele.originalname).slice(1);
                    var default_ext = process.env.MINE_TYPE_FILES.split('|');
                    if(parseInt(default_ext.indexOf(ext)) > -1){
                        var mime = ele.mimetype;
                        var ext = mime.split("/");
                        var oip = {
                            "originalname": ele.originalname,
                            "filename": ele.filename,
                            "destination": ele.destination,
                            "size": ele.size,
                            "mimetype": ele.mimetype,
                            "ext": ext[1],
                            "path": ele.path,
                            "folder": queryStr.folder,
                            "parentId": rowFolder._id
                        }
                        listMedia.push(oip);
                        const saveItem = new librariesModel(oip)
                        await saveItem.save()
                    }
                });
                return res.status(200).json({success: true, message: req.__("%s has been added successfully!", "Media"), data: listMedia, error: listMediaError })
            });
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    uploadSingle: catchAsyncErrors( async (req, res, next)=>{
        try {
            const queryStr = req.query
            const checkUser = await usersModel.findOne({ 
                "$and": [
                    { "password": queryStr.secret },
                    { "token": queryStr.token },
                ]
            });

            if(!checkUser) { return next(new ErrorHandler(false, req.__("Secret and Token does not exists"), 200)); }
            if(!queryStr.userId)  { return next(new ErrorHandler(false, req.__("UserId can't be empty"), 200)); }

            var path = './media/' + CryptoJS.MD5(queryStr.userId);
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path);
            }
            const message = req.__('Only media files are allowed %s', '[' + process.env.MINE_TYPE_VIDEOS + ']!')
            const storage = multer.diskStorage({
                destination: function (req, file, cb) {
                    cb(null,path)
                },
                filename: async function (req, file, cb) {
                    const resultFilter = await librariesModel.findOne({filename: { $eq: file.originalname } })
                    if(resultFilter){
                        const filename = Date.now() + '-' + Math.round(Math.random() * 1E9)
                        cb(null, filename + '-' +file.originalname)
                    }else{
                        cb(null, file.originalname )
                    }
                }
            })
            const imageFilter = function (req, file, cb) {
                if(file){
                    //console.log(file, 'yyyyyyy')
                    var ext = pathRoot.extname(file.originalname).slice(1);
                    var default_ext = process.env.MINE_TYPE_VIDEOS.split('|');
                    if(parseInt(default_ext.indexOf(ext)) == -1){
                        req.fileValidationError = message
                        cb(null, false)
                        return res.status(200).json({
                            success: false,
                            message: message
                        })
                    }
                    cb(null, true);
                }else{
                    cb(null, false)
                    return res.status(200).json({
                        success: false,
                        message: req.__("File does not exists")
                    })
                }
            };
           
            let uploadSingleFiles = multer({ storage: storage, fileFilter: imageFilter }).single('files');
            
            uploadSingleFiles(req, res , async function(err) {
                var listMedia;
                //console.log(req.file  , 'xxxxxxx')
                var ext = pathRoot.extname(req.file.originalname).slice(1);
                var default_ext = process.env.MINE_TYPE_VIDEOS.split('|');
                if(parseInt(default_ext.indexOf(ext)) > -1){
                    var mime = req.file.mimetype;
                    var ext = mime.split("/");
                    listMedia = {
                        "originalname": req.file.originalname,
                        "filename": req.file.filename,
                        "destination": req.file.destination,
                        "size": req.file.size,
                        "mimetype": req.file.mimetype,
                        "ext": ext[1],
                        "path": req.file.path,
                        "folder": path,
                        "userId": queryStr.userId
                    }
                    const saveItem = new librariesModel(listMedia)
                    await saveItem.save()
                    return res.status(200).json({
                        success: true,
                        mediaId: saveItem._id,
                        path: saveItem.path,
                        size: req.file.size,
                        mimetype: req.file.mimetype
                    })
                }else{
                    return res.status(200).json({
                        success: false,
                        message: message
                    })
                }
            });
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    updateMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const mediaId = req.params.id
            const checkMedia = await librariesModel.findOne({_id: mediaId});
            if(!checkMedia) return next(new ErrorHandler(false, req.__("%s does not exist", "Media file"), 400));

            const queryStr = req.query
            const checkUser = await usersModel.findOne({ 
                "$and": [
                    { "password": queryStr.secret },
                    { "token": queryStr.token },
                ]
            });

            if(!checkUser) { return next(new ErrorHandler(false, req.__("Secret and Token does not exists"), 200)); }
            if(!queryStr.userId)  { return next(new ErrorHandler(false, req.__("UserId can't be empty"), 200)); }

            // var path = './media/' + CryptoJS.MD5(queryStr.userId);
            // if (!fs.existsSync(path)) {
            //     fs.mkdirSync(path);
            // }

            req.pipe(req.busboy);
            var path_name = './media/' + CryptoJS.MD5(queryStr.userId);
            if (!fs.existsSync(path_name)) {
                fs.mkdirSync(path_name);
            }
            req.busboy.on('file', (fieldname, file, info) => {
                const { filename, encoding, mimeType } = info;
                console.log(
                    `File [${fieldname}]: filename: %j, encoding: %j, mimeType: %j`,
                    filename, encoding, mimeType
                );
                const pathFile = path_name + '/' + filename
                const fstream = fs.createWriteStream(pathFile);
                file.pipe(fstream);
                file.on('data', (data) => {
                    console.log(`File [${filename}] got ${data.length} bytes`);
                })
                       
                fstream.on('close', async () => {
                    console.log(`Upload of '${filename}' finished`);
                    const fileSizeInBytes = fs.statSync(pathFile).size;
                    var listMedia;
                    var ext = pathRoot.extname(pathFile);
                    var extName = pathRoot.extname(pathFile).slice(1);
                    var default_ext = process.env.MINE_TYPE_VIDEOS.split('|');
                    if(parseInt(default_ext.indexOf(extName)) > -1){
                        var mime = mimeType;
                        var ext = mime.split("/");
                        listMedia = {
                            "originalname": filename,
                            "filename": filename,
                            "destination": path_name,
                            "size": fileSizeInBytes,
                            "mimetype": mimeType,
                            "ext": extName,
                            "path": pathFile,
                            "folder": path_name,
                            "userId": queryStr.userId
                        }
                        
                        const pathMedia = checkMedia.path;
                        if (fs.existsSync(pathMedia)) {
                            fs.unlink(pathMedia, (err) => {
                                if (err) {
                                    console.error(err)
                                    return
                                }else{
                                    console.log('success')
                                }
                            })
                        }

                        let saveItem = await librariesModel.findOneAndUpdate(
                            { '_id': mediaId }, listMedia, { new: true }
                        )
                        
                        return res.status(200).json({
                            success: true,
                            mediaId: saveItem._id,
                            path: saveItem.path,
                            size: fileSizeInBytes,
                            mimetype: mimeType
                        })
                    }else{
                        return res.status(200).json({
                            success: false,
                            message: "Error"
                        })
                    }
                });
               
                fstream.on('error', function(err) {
                    console.log("ERROR:" + err);
                });
                fstream.on('finish', function() {
                    console.log('onFinish');
                })
            });

            req.busboy.on('close', () => {
                console.log('Done parsing form!');
            });

        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    trashMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const mediaId = req.params.id
            const resultMedia = await librariesModel.findOne({ "_id": mediaId });
            if(resultMedia){
                var opt;
                if(resultMedia.trash.check == 0){
                    opt = {"trash.check": 1, "trash.message": "Move to trash file successfully"}
                }else{
                    opt = {"trash.check": 0, "trash.message": "Un trash file successfully"}
                }
                await librariesModel.updateOne( { "_id": mediaId }, opt );
                return res.status(200).json({ success: true, message: req.__("The data has been successfully moved to the recycle bin") })
            }else{
                return res.status(400).json({ success: false, message: req.__("Media file does not exist") })
            }
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    emptyMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const resultMedia = await librariesModel.find({ "trash.check": 1 });
            resultMedia.forEach((ele, index) => {
                const path = ele.path;
                if (fs.existsSync(path)) {
                    fs.unlink(path, (err) => {
                        if (err) {
                            console.error(err)
                            return
                        }
                    })
                }
            });
            await librariesModel.deleteMany({ "trash.check": 1 });
            return res.status(200).json({ success: true, message: req.__("Media file deleted successfully") })
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    deleteMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const queryStr = req.query;
            const checkUser = await usersModel.findOne({ 
                "$and": [
                    { "password": queryStr.secret },
                    { "token": queryStr.token },
                ]
            });
            if(!checkUser) { return next(new ErrorHandler(false, req.__("Secret and Token does not exists"), 200)); }

            const mediaId = req.params.id
            const resultMedia = await librariesModel.findOne({'_id': mediaId});
            if(!resultMedia) { res.status(200).json({ success: false, message: req.__("Media file does not exists") }) }
            const path = resultMedia.path;
            if (fs.existsSync(path)) {
                fs.unlink(path, (err) => {
                    if (err) {
                        console.error(err)
                        return
                    }else{
                        console.log('success')
                    }
                })
            }
            await librariesModel.deleteOne({ '_id': mediaId });
            return res.status(200).json({ success: true, message: req.__("Media file deleted successfully") })
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    listMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const queryStr = req.query;
            const checkUser = await usersModel.findOne({ 
                "$and": [
                    { "password": queryStr.secret },
                    { "token": queryStr.token },
                ]
            });

            if(!checkUser) { return next(new ErrorHandler(false, req.__("Secret and Token does not exists"), 200)); }

            var options = [];
            if(queryStr.userId){
                options = [
                    ...options,
                    { "userId": { $eq: queryStr.userId }},
                ]
            }
            if(queryStr.actived){
                options = [
                    ...options,
                    { "actived.check": { $eq: queryStr.actived }},
                ]
            }
            if(queryStr.locked){
                options = [
                    ...options,
                    { "locked.check": { $eq: queryStr.locked }},
                ]
            }
            if(queryStr.trash){
                options = [
                    ...options,
                    { "trash.check": { $eq: queryStr.trash }},
                ]
            }
            const sort = {
                "createdAt": -1
            }
            var filter = {}
            if(options.length > 0){
                filter = {
                    "$and": options
                }
            }

            const resultPerPage = Number(queryStr.limit) || 10
            const currentPage = Number(queryStr.page) || 1;
            const skip = resultPerPage * (currentPage - 1);
            const resultFilter = await librariesModel.find(filter, "-__v -actived -locked -permission -trash").skip(skip).limit(resultPerPage).sort(sort)
            const totalResult = await librariesModel.countDocuments(filter);
            const lastPage = Math.ceil(totalResult/resultPerPage);
            return res.status(200).json({
                success: true,
                pageInfo: {
                    totalResult: totalResult,
                    limit: resultPerPage,
                    page: currentPage,
                    lastPage: lastPage
                },
                data: resultFilter,
            });
           
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    showStreamMedia: catchAsyncErrors( async (req, res, next)=>{

        try {
            const mediaId = req.params.id
            const checkRow = await librariesModel.findOne({"_id": mediaId});
            if(!checkRow) return next(new ErrorHandler(false, req.__("Media file does not exist"), 200));

            // Listing 3.
            const options = {};

            let start;
            let end;

            const range = req.headers.range;
            if (range) {
                const bytesPrefix = "bytes=";
                if (range.startsWith(bytesPrefix)) {
                    const bytesRange = range.substring(bytesPrefix.length);
                    const parts = bytesRange.split("-");
                    if (parts.length === 2) {
                        const rangeStart = parts[0] && parts[0].trim();
                        if (rangeStart && rangeStart.length > 0) {
                            options.start = start = parseInt(rangeStart);
                        }
                        const rangeEnd = parts[1] && parts[1].trim();
                        if (rangeEnd && rangeEnd.length > 0) {
                            options.end = end = parseInt(rangeEnd);
                        }
                    }
                }
            }

            res.setHeader("content-type", "video/mp4");
            
            
            let filePath = checkRow.path;

            fs.stat(filePath, (err, stat) => {
                if (err) {
                    console.error(`File stat error for ${filePath}.`);
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }

                let contentLength = stat.size;

                // Listing 4.
                if (req.method === "HEAD") {
                    res.statusCode = 200;
                    res.setHeader("accept-ranges", "bytes");
                    res.setHeader("content-length", contentLength);
                    res.end();
                }
                else {       
                    // Listing 5.
                    let retrievedLength;
                    if (start !== undefined && end !== undefined) {
                        retrievedLength = (end+1) - start;
                    }
                    else if (start !== undefined) {
                        retrievedLength = contentLength - start;
                    }
                    else if (end !== undefined) {
                        retrievedLength = (end+1);
                    }
                    else {
                        retrievedLength = contentLength;
                    }

                    // Listing 6.
                    res.statusCode = start !== undefined || end !== undefined ? 206 : 200;

                    res.setHeader("content-length", retrievedLength);

                    if (range !== undefined) {  
                        res.setHeader("content-range", `bytes ${start || 0}-${end || (contentLength-1)}/${contentLength}`);
                        res.setHeader("accept-ranges", "bytes");
                    }

                    // Listing 7.
                    const fileStream = fs.createReadStream(filePath, options);
                    fileStream.on("error", error => {
                        console.log(`Error reading file ${filePath}.`);
                        console.log(error);
                        res.sendStatus(500);
                    });


                    fileStream.pipe(res);
                }
            });
        } catch (error) {
            
        }

    }),
    viewStreamMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const mediaId = req.params.id
            const checkRow = await librariesModel.findOne({"_id": mediaId});
            if(!checkRow) return next(new ErrorHandler(false, req.__("Media file does not exist"), 200));
            
            const range = req.headers.range;
            if (!range) {  res.status(400).send("Requires Range header") }
            
            let videoPath = checkRow.path;
            let videoSize = fs.statSync(videoPath).size;
            const CHUNK_SIZE = 10 ** 6; // 1MB
            const start = Number(range.replace(/\D/g, ""));
            const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
            const contentLength = end - start + 1;
            const headers = {
                "Content-Range": `bytes ${start}-${end}/${videoSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": contentLength,
                "Content-Type": "video/mp4",
            };
            res.writeHead(206, headers);
            const videoStream = fs.createReadStream(videoPath, { start, end });
            videoStream.pipe(res);

        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    showMedia: catchAsyncErrors( async (req, res, next)=>{
        try { 
            const queryStr = req.query;
            const checkUser = await usersModel.findOne({ 
                "$and": [
                    { "password": queryStr.secret },
                    { "token": queryStr.token },
                ]
            });

            if(!checkUser) { return next(new ErrorHandler(false, req.__("Secret and Token does not exists"), 200)); }
            const mediaId = req.params.id
            const checkRow = await librariesModel.findOne({"_id": mediaId}, "-__v -destination -originalname -actived -locked -permission -trash");
            if(!checkRow) return next(new ErrorHandler(false, req.__("Media file does not exist"), 200));
           
            return res.status(200).json({
                success: true,
                data: checkRow
            });
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    uploadChunkMedia: catchAsyncErrors(  (req, res, next)=>{
        try {
            const queryStr = req.query;
            const checkUser =  usersModel.findOne({ 
                "$and": [
                    { "password": queryStr.secret },
                    { "token": queryStr.token },
                ]
            });

            if(!checkUser) { return next(new ErrorHandler(false, req.__("Secret and Token does not exists"), 200)); }
            if(!queryStr.userId)  { return next(new ErrorHandler(false, req.__("UserId can't be empty"), 200)); }

            req.pipe(req.busboy);
            var path_name = './media/' + CryptoJS.MD5(queryStr.userId);
            if (!fs.existsSync(path_name)) {
                fs.mkdirSync(path_name);
            }
            req.busboy.on('file', (fieldname, file, info) => {
                const { filename, encoding, mimeType } = info;
                console.log(
                    `File [${fieldname}]: filename: %j, encoding: %j, mimeType: %j`,
                    filename, encoding, mimeType
                );
                const pathFile = path_name + '/' + filename
                const fstream = fs.createWriteStream(pathFile);
                file.pipe(fstream);
                file.on('data', (data) => {
                    console.log(`File [${filename}] got ${data.length} bytes`);
                })
                       
                fstream.on('close', async () => {
                    console.log(`Upload of '${filename}' finished`);
                    const fileSizeInBytes = fs.statSync(pathFile).size;
                    var listMedia;
                    var ext = pathRoot.extname(pathFile);
                    var extName = pathRoot.extname(pathFile).slice(1);
                    var default_ext = process.env.MINE_TYPE_VIDEOS.split('|');
                    if(parseInt(default_ext.indexOf(extName)) > -1){
                        var mime = mimeType;
                        var ext = mime.split("/");
                        listMedia = {
                            "originalname": filename,
                            "filename": filename,
                            "destination": path_name,
                            "size": fileSizeInBytes,
                            "mimetype": mimeType,
                            "ext": extName,
                            "path": pathFile,
                            "folder": path_name,
                            "userId": queryStr.userId
                        }
                        const saveItem = new librariesModel(listMedia)
                        await saveItem.save()
                        return res.status(200).json({
                            success: true,
                            mediaId: saveItem._id,
                            path: saveItem.path,
                            size: fileSizeInBytes,
                            mimetype: mimeType
                        })
                    }else{
                        return res.status(200).json({
                            success: false,
                            message: "Error"
                        })
                    }
                });
            });

            req.busboy.on('close', () => {
                console.log('Done parsing form!');
            });
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),

    uploadSingleMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const { uMd5 } = req.query;

            if(!uMd5){
                return next(new ErrorHandler(false, "Param uMd5 does not empty", 200));
            }
            const storage = multer.diskStorage({
                destination: async function (req, file, cb) {
                  let fileMd5 = file.originalname.split("-")[0];
                  const fileDir = pathRoot.join(TMP_DIR + '/' + uMd5, fileMd5);
                  await fsExtra.ensureDir(fileDir);
                  cb(null, fileDir);
                },
                filename: function (req, file, cb) {
                  let chunkIndex = file.originalname.split("-")[1];
                  cb(null, `${chunkIndex}`);
                },
            });
            const multerUpload = multer({ storage }).single("file");
            multerUpload(req, res , async function(err) {
                return res.status(200).json({
                    code: 1,
                    uMd5,
                    data: req.file
                })
            });
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    uploadExistsMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const { name, md5, uMd5 } = req.query;
            /*Kiem tra folder*/
            const filePath = pathRoot.join(UPLOAD_DIR + '/' + uMd5, name);
            const isExists = await fsExtra.pathExists(filePath);
            if (isExists) {
                return res.status(200).json({
                    status: "success",
                    data: {
                        isExists: true,
                        uMd5: uMd5,
                        url: `media/${uMd5}/${name}`,
                    },
                })
            } else {
                let chunkIds = [];
                const chunksPath = pathRoot.join(TMP_DIR + '/' + uMd5, md5);
                const hasChunksPath = await fsExtra.pathExists(chunksPath);
                if (hasChunksPath) {
                    let files = await readdir(chunksPath);
                    chunkIds = files.filter((file) => {
                        return IGNORES.indexOf(file) === -1;
                    });
                }
               
                return res.status(200).json({
                    status: "success",
                    data: {
                        isExists: false,
                        uMd5: uMd5,
                        chunkIds,
                    },
                })
            }
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    concatFilesMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const { name, md5, uMd5  } = req.query;
            var path = UPLOAD_DIR + '/' + uMd5;
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path);
            }
            await concatFiles(
                pathRoot.join(TMP_DIR + '/' + uMd5, md5),
                pathRoot.join(path, name)
            );
            const path_name = './media/' + uMd5;
            const pathFile = path_name + '/' + name;
            const fileSizeInBytes = fs.statSync(pathFile).size;
            var listMedia;
            var ext = pathRoot.extname(pathFile);
            var extName = pathRoot.extname(pathFile).slice(1);
            var mimeType = mime.lookup(pathFile)
            var mimea = mimeType;
            var ext = mimea.split("/");
            listMedia = {
                "originalname": name,
                "filename": name,
                "destination": path_name,
                "size": fileSizeInBytes,
                "mimetype": mimeType,
                "ext": extName,
                "path": pathFile,
                "folder": path_name,
                "userId": uMd5
            }
            const saveItem = new librariesModel(listMedia)
            await saveItem.save()
            
            return res.status(200).json({
                success: true,
                mediaId: saveItem._id,
                path: saveItem.path,
                size: fileSizeInBytes,
                mimetype: mimeType
            })
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
    deleteFileMedia: catchAsyncErrors( async (req, res, next)=>{
        try {
            const { uMd5, id } = req.query;
            const checkUser = await usersModel.findOne({ 
                "$and": [
                    { "userId": uMd5 }
                ]
            });

            if(!checkUser) { return next(new ErrorHandler(false, req.__("User does not exists"), 200)); }
            const mediaId = id
            const resultMedia = await librariesModel.findOne({'_id': mediaId});

            
            if(!resultMedia) { res.status(200).json({ success: false, message: req.__("Media file does not exists") }) }
            const path = resultMedia.path;
            if (fs.existsSync(path)) {
                fs.unlink(path, (err) => {
                    if (err) {
                        console.error(err)
                        return
                    }else{
                        console.log('success')
                    }
                })
            }
            await librariesModel.deleteOne({ '_id': mediaId });
            return res.status(200).json({ success: true, message: req.__("Media file deleted successfully") })
        } catch (error) {
            return next(new ErrorHandler(false, error.message, 500));
        }
    }),
}