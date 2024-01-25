const http = require('http')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const compilerSfc = require('@vue/compiler-sfc')
const compilerDom = require('@vue/compiler-dom')
const basePath = 'src'


// 检查是否是静态文件
const imageRE = /\.(png|jpe?g|gif|svg|ico|webp)(\?.*)?$/;
const mediaRE = /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/;
const fontsRE = /\.(woff2?|eot|ttf|otf)(\?.*)?$/i;
const isStaticAsset = (file) => {
  return imageRE.test(file) || mediaRE.test(file) || fontsRE.test(file);
};

function rewriteImport(content) {
  return content.replace(/ from ['|"]([^'"]+)['|"]/g, function (s0, s1) { // 找到 from 'vue'
    if (s1[0] !== '.' && s1[1] !== '/') {
      return `from '/@modules/${s1}'`
    } else {
      return s0
    }
  })
}

function writeFileCss(content) {
  return `const css = "${content}"
  let link = document.createElement('style')
  link.setAttribute('type','text/css')
  document.head.appendChild(link)
  link.innerHTML = css
  export default css
`
}

const server = http.createServer((req, res) => {
  const { url } = req
  const query = new URL(req.url, `http://${req.headers.host}`).searchParams

  // 拦截html
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
  } else if (url.indexOf('.vue') !== -1) {
    const p = path.resolve(__dirname, url.split('?')[0].slice(1))
    const { descriptor } = compilerSfc.parse(fs.readFileSync(p, 'utf8'))
    if (!query.get('type')) {
      res.writeHead(200, {
        'Content-type': 'application/javascript'
      })
      let content = `
        ${rewriteImport(descriptor.script.content.replace('export default', 'const __script='))}
        import {render as __render} from "${url}?type=template"
        __script.render = __render
        export default __script
      `
      if (descriptor.styles) {
        descriptor.styles.forEach((s, i) => {
          content += `import '${url}?type=style&index=${i}'`
        });
      }

      res.end(content)
    } else if (query.get('type') === 'template') { // 返回vue文件的html部分
      const template = descriptor.template
      const render = compilerDom.compile(template.content, { mode: 'module' }).code
      res.writeHead(200, {
        'Content-type': 'application/javascript'
      })
      res.end(rewriteImport(render))
    } else if (query.get('type') === 'style') { // 处理vue文件的html 部分 
      let index = query.get('index')
      let styleContent = descriptor.styles[index].content
      const content = writeFileCss(styleContent.replace(/\r\n/g, ''))
      res.writeHead(200, {
        'Content-type': 'application/javascript'
      })
      res.end(content)
    }


  } else if (url.endsWith('.css')) {
    const p = path.resolve(__dirname, url.slice(1))
    const file = fs.readFileSync(p, 'utf8')
    const content = writeFileCss(file.replace(/\r\n/g, ''))
    res.writeHead(200, {
      'Content-type': 'application/javascript'
    })
    res.end(content)
  } else if (isStaticAsset(url)) {
    // res.writeHead(200, {
    //   'Content-type': 'application/javascript'
    // })
    // console.log(process.cwd())
    // console.log(basePath + url)
    // const p = path.resolve(__dirname, url.slice(1))

    res.end(`export default '/src/assets/vue.svg'`)
  }


})

server.listen(8080, () => {
  console.log('http://localhost:8080/')
  console.log('listening on port 8080 ')
})