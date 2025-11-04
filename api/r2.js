import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus', '.webm']
const R2_BUCKET_NAME = 'music'

function getR2Client() {
  const accountId = process.env.ACCOUNT_ID
  const accessKeyId = process.env.ACCESS_KEY_ID
  const secretAccessKey = process.env.SECRET_ACCESS_KEY
  
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null
  }
  
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
  
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  try {
    const s3Client = getR2Client()
    if (!s3Client) {
      return res.status(500).json({ 
        error: 'R2存储桶未配置',
        message: '请设置环境变量'
      })
    }
    
    const bucketName = R2_BUCKET_NAME
    
    if (req.method === 'GET') {
      const action = req.query.action
      const key = req.query.key
      
      if (action === 'list') {
        try {
          const command = new ListObjectsV2Command({
            Bucket: bucketName
          })
          const response = await s3Client.send(command)
          
          const objects = response.Contents || []
          const audioFiles = objects
            .filter(obj => {
              const name = obj.Key.toLowerCase()
              return AUDIO_EXTS.some(ext => name.endsWith(ext))
            })
            .map(obj => {
              const name = obj.Key
              const base = name.replace(/\.[^.]+$/, '')
              const title = base.replace(/\s*-\s*/g, ' - ').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim() || name
              
              const url = `/api/r2?key=${encodeURIComponent(name)}`
              
              return {
                name: name,
                title: title,
                url: url,
                size: obj.Size,
                uploaded: obj.LastModified
              }
            })
          
          return res.status(200).json({
            success: true,
            total: audioFiles.length,
            data: audioFiles
          })
        } catch (error) {
          console.error('[api/r2] 列表获取错误:', error)
          return res.status(500).json({ 
            error: '获取歌曲列表失败',
            message: error.message 
          })
        }
      }
      
      if (!key) {
        return res.status(400).json({ error: '缺少 key 参数' })
      }
      
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: bucketName,
          Key: key
        })
        
        let contentType = 'audio/mpeg'
        let contentLength = 0
        
        try {
          const headResponse = await s3Client.send(headCommand)
          contentType = headResponse.ContentType || 'audio/mpeg'
          contentLength = headResponse.ContentLength || 0
        } catch (headError) {
          if (headError.name === 'NotFound') {
            return res.status(404).json({ error: '文件不存在' })
          }
          throw headError
        }
        
        const fileNameLower = key.toLowerCase()
        if (fileNameLower.endsWith('.mp3')) contentType = 'audio/mpeg'
        else if (fileNameLower.endsWith('.wav')) contentType = 'audio/wav'
        else if (fileNameLower.endsWith('.flac')) contentType = 'audio/flac'
        else if (fileNameLower.endsWith('.aac')) contentType = 'audio/aac'
        else if (fileNameLower.endsWith('.m4a')) contentType = 'audio/mp4'
        else if (fileNameLower.endsWith('.ogg')) contentType = 'audio/ogg'
        else if (fileNameLower.endsWith('.opus')) contentType = 'audio/opus'
        else if (fileNameLower.endsWith('.webm')) contentType = 'audio/webm'
        
        const rangeHeader = req.headers.range
        if (rangeHeader) {
          const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10)
            const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : contentLength - 1
            
            const getCommand = new GetObjectCommand({
              Bucket: bucketName,
              Key: key,
              Range: `bytes=${start}-${end}`
            })
            
            const objectResponse = await s3Client.send(getCommand)
            const chunks = []
            for await (const chunk of objectResponse.Body) {
              chunks.push(chunk)
            }
            const buffer = Buffer.concat(chunks)
            
            res.setHeader('Content-Type', contentType)
            res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`)
            res.setHeader('Content-Length', buffer.length)
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
            
            return res.status(206).send(buffer)
          }
        }
        
        const getCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: key
        })
        
        const objectResponse = await s3Client.send(getCommand)
        const chunks = []
        for await (const chunk of objectResponse.Body) {
          chunks.push(chunk)
        }
        const buffer = Buffer.concat(chunks)
        
        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Length', buffer.length)
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        
        return res.status(200).send(buffer)
      } catch (error) {
        console.error('[api/r2] 文件获取错误:', error)
        if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
          return res.status(404).json({ error: '文件不存在' })
        }
        return res.status(500).json({ 
          error: '获取文件失败',
          message: error.message 
        })
      }
    }
    
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || ''
      
      let fileName = ''
      let fileData = null
      let mimeType = 'audio/mpeg'
      
      if (contentType.includes('multipart/form-data')) {
        return res.status(501).json({ 
          error: 'multipart/form-data 上传需要使用 JSON 格式或安装 multer' 
        })
      }
      
      const body = req.body || {}
      fileName = body.fileName || ''
      const base64 = body.base64 || ''
      const sourceUrl = body.sourceUrl || ''
      
      if (!fileName) {
        return res.status(400).json({ error: '缺少 fileName' })
      }
      
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: bucketName,
          Key: fileName
        })
        await s3Client.send(headCommand)
        return res.status(409).json({ error: '文件已存在', exists: true })
      } catch {
      }
      
      if (base64) {
        const binaryString = Buffer.from(base64, 'base64')
        fileData = binaryString
      } else if (sourceUrl) {
        try {
          const upstream = await fetch(sourceUrl, {
            redirect: 'follow',
            headers: {
              'User-Agent': 'web-music-player/0.1',
              'Accept': 'audio/*,*/*'
            }
          })
          
          if (!upstream.ok) {
            return res.status(502).json({ 
              error: `下载源文件失败: ${upstream.status}` 
            })
          }
          
          fileData = Buffer.from(await upstream.arrayBuffer())
          const contentTypeHeader = upstream.headers.get('content-type')
          if (contentTypeHeader) {
            mimeType = contentTypeHeader
          }
        } catch (e) {
          return res.status(502).json({ 
            error: `下载源文件错误: ${e.message}` 
          })
        }
      } else {
        return res.status(400).json({ error: '缺少文件数据、base64 或 sourceUrl' })
      }
      
      const fileNameLower = fileName.toLowerCase()
      if (fileNameLower.endsWith('.mp3')) mimeType = 'audio/mpeg'
      else if (fileNameLower.endsWith('.wav')) mimeType = 'audio/wav'
      else if (fileNameLower.endsWith('.flac')) mimeType = 'audio/flac'
      else if (fileNameLower.endsWith('.aac')) mimeType = 'audio/aac'
      else if (fileNameLower.endsWith('.m4a')) mimeType = 'audio/mp4'
      else if (fileNameLower.endsWith('.ogg')) mimeType = 'audio/ogg'
      else if (fileNameLower.endsWith('.opus')) mimeType = 'audio/opus'
      else if (fileNameLower.endsWith('.webm')) mimeType = 'audio/webm'
      
      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: fileData,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable'
      })
      
      await s3Client.send(putCommand)
      
      const rawUrl = `/api/r2?key=${encodeURIComponent(fileName)}`
      
      return res.status(200).json({ 
        ok: true, 
        rawUrl 
      })
    }
    
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('[api/r2] 错误:', error)
    return res.status(500).json({ 
      error: 'R2 API 错误',
      message: error.message 
    })
  }
}
