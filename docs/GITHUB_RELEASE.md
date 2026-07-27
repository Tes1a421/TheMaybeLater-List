# GitHub 发布说明

## 1. 准备 GitHub CLI

安装 GitHub CLI：

```powershell
winget install --id GitHub.cli
```

重新打开终端后登录：

```powershell
gh auth login
```

选择 GitHub.com、HTTPS，并按浏览器提示授权。

## 2. 创建独立仓库

在本项目目录运行：

```powershell
git init
git add .gitignore .github assets docs CHANGELOG.md DISCLAIMER.md README.md package.json package-lock.json index.html styles.css renderer.js main.js preload.js
git commit -m "发布小羊鸽单 1.0.0"
git branch -M main
gh repo create xiaoyang-gedan --public --source . --remote origin --push
```

如不希望公开源码，将 `--public` 改为 `--private`。

不要把 `node_modules`、`release`、证书或密码提交到仓库。

## 3. 创建正式版本

推送版本标签：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 会在 Windows 环境重新构建安装程序和 ZIP，并创建对应的 GitHub Release。

也可以手动构建并上传：

```powershell
npm ci
npm run build:win
gh release create v1.0.0 `
  "release/小羊鸽单-1.0.0-x64.exe" `
  "release/小羊鸽单-1.0.0-x64.zip" `
  --title "小羊鸽单 1.0.0" `
  --notes-file CHANGELOG.md
```

## 4. 后续版本

1. 修改 `package.json` 中的版本号。
2. 在 `CHANGELOG.md` 顶部记录变化。
3. 运行语法检查和本地构建。
4. 提交代码并推送对应版本标签。

代码签名证书、令牌和 `.env` 文件不得提交到 GitHub。
