import { APIError, AuthError, ValidationError, errorHandler } from '../utils/errors'

export const deleteTrack = async (filePath, rawUrl, password) => {
  try {
    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, rawUrl, password: password || '' })
    })
    
    if (!res.ok) {
      const errorText = await res.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }

      if (res.status === 401) {
        throw new AuthError('认证失败，请检查密码', 'INVALID_PASSWORD')
      } else if (res.status === 404) {
        throw new APIError('文件不存在', res.status, '/api/delete', errorData)
      } else if (res.status === 500) {
        throw new APIError('服务器内部错误', res.status, '/api/delete', errorData)
      } else {
        throw new APIError(`删除失败：${errorData.error || errorText}`, res.status, '/api/delete', errorData)
      }
    }
    
    return res
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthError) {
      throw error
    }
    throw errorHandler.handle(error, '删除歌曲')
  }
}

export const uploadTrack = async (formData) => {
  try {
    const res = await fetch('/api/upload', { 
      method: 'POST', 
      body: formData 
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }

      if (res.status === 409 || res.status === 422) {
        if (errorData?.exists || /exists/i.test(text)) {
          throw new APIError('该文件已存在', res.status, '/api/upload', errorData)
        }
      } else if (res.status === 413) {
        throw new APIError('文件过大', res.status, '/api/upload', errorData)
      } else if (res.status === 500) {
        throw new APIError('服务器内部错误', res.status, '/api/upload', errorData)
      } else {
        throw new APIError(`上传失败: ${errorData.error || text}`, res.status, '/api/upload', errorData)
      }
    }
    
    return res.json()
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw errorHandler.handle(error, '上传歌曲')
  }
}

export const uploadTrackJson = async (data) => {
  try {
    const res = await fetch('/api/upload', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(data) 
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }

      if (res.status === 409 || res.status === 422) {
        if (errorData?.exists || /exists/i.test(text)) {
          throw new APIError('该文件已存在', res.status, '/api/upload', errorData)
        }
      } else if (res.status === 413) {
        throw new APIError('文件过大', res.status, '/api/upload', errorData)
      } else if (res.status === 500) {
        throw new APIError('服务器内部错误', res.status, '/api/upload', errorData)
      } else {
        throw new APIError(`上传失败: ${errorData.error || text}`, res.status, '/api/upload', errorData)
      }
    }
    
    return res.json()
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw errorHandler.handle(error, '上传歌曲JSON')
  }
}

export const importFromRepo = async (gitRepo, gitToken, gitBranch, gitPath) => {
  try {
    const branch = gitBranch || 'main'
    const [owner, repo] = String(gitRepo).split('/')
    if (!owner || !repo) {
      throw new ValidationError('GIT_REPO 格式应为 owner/repo', 'gitRepo', gitRepo)
    }
    
    const normPath = String(gitPath || 'public/music').replace(/^\/+|\/+$/g, '') || '.'
    const segs = normPath === '.' ? [] : normPath.split('/').filter(Boolean)
    const pathPart = segs.length ? '/' + segs.map(encodeURIComponent).join('/') : ''
    const listApi = `https://api.github.com/repos/${owner}/${repo}/contents${pathPart}?ref=${encodeURIComponent(branch)}`
    
    const listRes = await fetch(listApi, { 
      headers: { 
        'Authorization': `Bearer ${gitToken}`, 
        'Accept': 'application/vnd.github+json', 
        'User-Agent': 'web-music-player/0.1' 
      } 
    })
    
    if (!listRes.ok) {
      const errorText = await listRes.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }

      if (listRes.status === 401) {
        throw new AuthError('GitHub Token 无效或已过期', 'INVALID_TOKEN')
      } else if (listRes.status === 403) {
        throw new AuthError('GitHub Token 权限不足', 'INSUFFICIENT_PERMISSIONS')
      } else if (listRes.status === 404) {
        throw new APIError('仓库不存在或路径不存在', listRes.status, listApi, errorData)
      } else {
        throw new APIError(`读取仓库失败: ${errorData.error || errorText}`, listRes.status, listApi, errorData)
      }
    }
    
    return listRes.json()
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthError || error instanceof ValidationError) {
      throw error
    }
    throw errorHandler.handle(error, '导入仓库')
  }
}

export const importFromApi = async (apiUrl) => {
  const base = String(apiUrl || '').trim()
  const normBase = base.replace(/\/$/, '')
  const candidates = [`${normBase}/api/music/list`]
  
  let data = null
  let lastErr = null
  
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { headers: { 'accept': 'application/json' } })
      if (!resp.ok) { 
        lastErr = new Error(`HTTP ${resp.status}`)
        continue 
      }
      const ct = resp.headers.get('content-type') || ''
      if (!/json/i.test(ct)) {
        try { data = await resp.json() } catch { 
          lastErr = new Error('非 JSON 响应')
          continue 
        }
      } else {
        data = await resp.json()
      }
      if (data != null) break
    } catch (e) {
      lastErr = e
    }
  }
  
  if (data == null) {
    throw new Error(lastErr ? lastErr.message : '无法获取到歌单，请提供 player 实例地址（形如 https://host），程序会请求 /api/music/list')
  }
  
  const isPlayerStyle = data && Array.isArray(data.data)
  if (!isPlayerStyle) {
    throw new Error('仅支持 player 风格 API：需返回 { total, data: [...] }')
  }
  
  return data
}

export const webdavUpload = async (cursor, limit) => {
  const res = await fetch('/api/webdav', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ action: 'upload', cursor, limit }) 
  })
  
  const ok = res.status === 200 || res.status === 207
  if (!ok) {
    const t = await res.text()
    throw new Error(`WebDAV 上传失败: ${t}`)
  }
  
  return res.json()
}

export const webdavRestore = async (cursor, limit) => {
  const res = await fetch('/api/webdav', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ action: 'restore', cursor, limit }) 
  })
  
  const ok = res.status === 200 || res.status === 207
  if (!ok) {
    const t = await res.text()
    throw new Error(`WebDAV 恢复失败: ${t}`)
  }
  
  return res.json()
}

export const importFromR2 = async () => {
  try {
    const res = await fetch('/api/r2?action=list', {
      headers: { 'accept': 'application/json' }
    })
    
    if (!res.ok) {
      const errorText = await res.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      
      throw new APIError(`R2导入失败: ${errorData.error || errorText}`, res.status, '/api/r2', errorData)
    }
    
    const data = await res.json()
    
    if (!data.success || !Array.isArray(data.data)) {
      throw new APIError('R2 API 返回格式错误', 500, '/api/r2', data)
    }
    
    return data
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw errorHandler.handle(error, '导入R2歌曲')
  }
}

export const uploadTrackToR2 = async (formData) => {
  try {
    const res = await fetch('/api/r2', { 
      method: 'POST', 
      body: formData 
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }

      if (res.status === 409 || res.status === 422) {
        if (errorData?.exists || /exists/i.test(text)) {
          throw new APIError('该文件已存在', res.status, '/api/r2', errorData)
        }
      } else if (res.status === 413) {
        throw new APIError('文件过大', res.status, '/api/r2', errorData)
      } else if (res.status === 500) {
        throw new APIError('服务器内部错误', res.status, '/api/r2', errorData)
      } else {
        throw new APIError(`上传失败: ${errorData.error || text}`, res.status, '/api/r2', errorData)
      }
    }
    
    return res.json()
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw errorHandler.handle(error, '上传歌曲到 R2')
  }
}

export const uploadTrackToR2Json = async (data) => {
  try {
    const res = await fetch('/api/r2', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(data) 
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }

      if (res.status === 409 || res.status === 422) {
        if (errorData?.exists || /exists/i.test(text)) {
          throw new APIError('该文件已存在', res.status, '/api/r2', errorData)
        }
      } else if (res.status === 413) {
        throw new APIError('文件过大', res.status, '/api/r2', errorData)
      } else if (res.status === 500) {
        throw new APIError('服务器内部错误', res.status, '/api/r2', errorData)
      } else {
        throw new APIError(`上传失败: ${errorData.error || text}`, res.status, '/api/r2', errorData)
      }
    }
    
    return res.json()
  } catch (error) {
    if (error instanceof APIError) {
      throw error
    }
    throw errorHandler.handle(error, '上传歌曲到R2 (JSON)')
  }
}

export const saveFavoritesToGist = async (favorites) => {
  try {
    const res = await fetch('/api/gist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', favorites })
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }
      
      if (res.status === 401) {
        throw new AuthError('GitHub Token 无效或已过期', 'INVALID_TOKEN')
      } else if (res.status === 403) {
        throw new AuthError('GitHub Token 权限不足', 'INSUFFICIENT_PERMISSIONS')
      } else {
        throw new APIError(`保存收藏列表失败: ${errorData.error || text}`, res.status, '/api/gist', errorData)
      }
    }
    
    return res.json()
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthError) {
      throw error
    }
    throw errorHandler.handle(error, '保存收藏列表到 Gist')
  }
}

export const loadFavoritesFromGist = async () => {
  try {
    const res = await fetch('/api/gist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load' })
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }
      
      if (res.status === 401) {
        throw new AuthError('GitHub Token 无效或已过期', 'INVALID_TOKEN')
      } else if (res.status === 403) {
        throw new AuthError('GitHub Token 权限不足', 'INSUFFICIENT_PERMISSIONS')
      } else {
        throw new APIError(`加载收藏列表失败: ${errorData.error || text}`, res.status, '/api/gist', errorData)
      }
    }
    
    const data = await res.json()
    return data.favorites || []
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthError) {
      throw error
    }
    throw errorHandler.handle(error, '从 Gist 加载收藏列表')
  }
}

export const saveAudioCacheToGist = async (audioCache) => {
  try {
    const res = await fetch('/api/gist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveAudioCache', audioCache })
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }
      
      if (res.status === 401) {
        throw new AuthError('GitHub Token 无效或已过期', 'INVALID_TOKEN')
      } else if (res.status === 403) {
        throw new AuthError('GitHub Token 权限不足', 'INSUFFICIENT_PERMISSIONS')
      } else {
        throw new APIError(`保存音频缓存配置失败: ${errorData.error || text}`, res.status, '/api/gist', errorData)
      }
    }
    
    return res.json()
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthError) {
      throw error
    }
    throw errorHandler.handle(error, '保存音频缓存配置到 Gist')
  }
}

export const loadAudioCacheFromGist = async () => {
  try {
    const res = await fetch('/api/gist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'loadAudioCache' })
    })
    
    if (!res.ok) {
      const text = await res.text()
      let errorData
      try {
        errorData = JSON.parse(text)
      } catch {
        errorData = { error: text }
      }
      
      if (res.status === 401) {
        throw new AuthError('GitHub Token 无效或已过期', 'INVALID_TOKEN')
      } else if (res.status === 403) {
        throw new AuthError('GitHub Token 权限不足', 'INSUFFICIENT_PERMISSIONS')
      } else {
        throw new APIError(`加载音频缓存配置失败: ${errorData.error || text}`, res.status, '/api/gist', errorData)
      }
    }
    
    const data = await res.json()
    return data.audioCache || null
  } catch (error) {
    if (error instanceof APIError || error instanceof AuthError) {
      throw error
    }
    throw errorHandler.handle(error, '从 Gist 加载音频缓存配置')
  }
}
