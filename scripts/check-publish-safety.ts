import { execFileSync } from 'node:child_process';

// 检查Git索引中的内容；不递归读取开发者的私密目录，也不输出命中的值。
const files=execFileSync('git',['ls-files','--cached','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw new Error('发布检查失败：Git索引为空');
const forbidden=/(^|\/)(?:\.local|\.wrangler|\.superpowers|\.gstack|\.codex|\.vscode|node_modules|dist|docs)(?:\/|$)|(?:^|\/)\.(?:env|dev\.vars)(?:\..*)?$|\.(?:pem|key|sqlite(?:-\w+)?|db(?:-\w+)?|log)$/;
const examples=new Set(['.dev.vars.example','.env.example']);
const signatures=[
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/,
  /\b(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /https:\/\/m\.mcd\.cn\/mcp\/scanToPay\?orderId=\d+/,
];
const configured=['OPENAI_API_KEY','DEEPSEEK_API_KEY','MCD_MCP_TOKEN'].map(name=>({name,value:process.env[name]?.trim()})).filter(entry=>entry.value&&entry.value.length>=12);
let failed=false;
for(const file of files){
  if(forbidden.test(file)&&!examples.has(file)){console.error('禁止发布的文件：'+file);failed=true;continue;}
  const content=execFileSync('git',['show',':'+file],{maxBuffer:10*1024*1024});
  const text=content.toString('utf8');
  if(signatures.some(pattern=>pattern.test(text))){console.error('疑似凭证或私密订单链接：'+file);failed=true;}
  for(const secret of configured)if(content.includes(secret.value!)){console.error('发现已配置凭证（'+secret.name+'）：'+file);failed=true;}
}
if(failed)process.exitCode=1;else console.log(`发布检查通过：${files.length}个索引文件；未发现受禁文件或已知凭证。此检查不能替代完整秘密扫描。`);
