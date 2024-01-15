const http = require('http')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const compilerSfc = require('@vue/compiler-sfc')
const compilerDom = require('@vue/compiler-dom')


function rewriteImport(content) {
  return content.replace(/ from ['|"]([^'"]+)['|"]/g, function (s0, s1) { // 找到 from 'vue'
    if (s1[0] !== '.' && s1[1] !== '/') {
      return `from '/@modules/${s1}'`
    } else {
      return s0
    }
  })
}

const server = http.createServer((req, res) => {
  const { url } = req
  const query = new URL(req.url, `http://${req.headers.host}`).searchParams

  if (url === '/') {
    // 设置Content-type 响应头是为了让浏览器已html的编码方式去加载这份资源
    res.writeHead(200, {
      'Content-type': 'text/html'
    })

    let content = fs.readFileSync('./index.html', 'utf8')
    res.end(content)

  } else if (url.endsWith('.js')) {
    const p = path.resolve(__dirname, url.slice(1)) // '/main.js' => 'main.js' 的绝对路径
    res.writeHead(200, {
      'Content-type': 'application/javascript'
    })
    const content = fs.readFileSync(p, 'utf8')
    res.end(rewriteImport(content))

  } else if (url.startsWith('/@modules/')) {
    const prefix = path.resolve(__dirname, 'node_modules', url.replace('/@modules/', ''))
    const module = require(prefix + '/package.json').module
    const p = path.resolve(prefix, module)
    const content = fs.readFileSync(p, 'utf8')
    res.writeHead(200, {
      'Content-type': 'application/javascript'
    })
    res.end(rewriteImport(content))
  } else if (url.indexOf('vue') !== -1) {
    const p = path.resolve(__dirname, url.split('?')[0].slice(1))
    const { descriptor } = compilerSfc.parse(fs.readFileSync(p, 'utf8'))
    if (!query.get('type')) {
      res.writeHead(200, {
        'Content-type': 'application/javascript'
      })
      const content = `
        ${rewriteImport(descriptor.script.content.replace('export default', 'const __script='))}
        import {render as __render} from "${url}?type=template"
        __script.render = __render
        export default __script
      `
      res.end(content)
    } else if (query.get('type') === 'template') { // 返回vue文件的html部分
      const template = descriptor.template
      const render = compilerDom.compile(template.content, { mode: 'module' }).code
      res.writeHead(200, {
        'Content-type': 'application/javascript'
      })
      res.end(rewriteImport(render))

    }
  } else if (url.endsWith('.css')) {
    const p = path.resolve(__dirname, url.slice(1))
    const file = fs.readFileSync(p, 'utf8')
    const content = `
      const css = "${file.replace(/\n/g, '')}"
      let link = document.createElement('style')
      link.setAttribute('type','text/css')
      document.head.appendChild(link)
      link.innerHTML = css
      export default css
    `
    res.writeHead(200, {
      'Content-type': 'application/javascript'
    })
    res.end(content)
  }
})

server.listen(8080, () => {
  console.log('listening on port 8080 ')
})