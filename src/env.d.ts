import type { ModelEnv } from './model-config.ts';
// 平台绑定与非秘密配置由Wrangler生成，模型配置允许本地尚未配置的提供商密钥。
declare global { interface Env extends ModelEnv {} }
