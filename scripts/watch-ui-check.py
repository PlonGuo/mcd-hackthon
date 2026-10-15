"""真实浏览器检查新消息滚动、等待状态、重放和同分判决展示。"""
import json, os, subprocess, time, urllib.request
from pathlib import Path
from urllib.parse import urlparse

os.environ['BROWSE_PARENT_PID'] = '0'
binary = os.environ.get('BROWSE_BIN', str(Path.home() / '.agents/skills/gstack/browse/dist/browse'))
base = os.environ.get('BASE_URL', 'http://localhost:8788')
failures = []

def api(path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
    assert result['ok'], result
    return result['data']

def browse(*args):
    result = subprocess.run([binary, *args], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr[:400]
    return result.stdout.strip()

def check(condition, message):
    if not condition:
        failures.append(message)

def ui():
    return json.loads(browse('js', '''JSON.stringify({
      messages:document.querySelectorAll('#messages li').length,
      latestBottom:document.querySelector('#messages li:last-child')?.getBoundingClientRect().bottom,
      height:innerHeight,scrollY,
      waiting:!!document.getElementById('waiting')&&!document.getElementById('waiting').hidden,
      waitingText:document.getElementById('waiting')?.textContent??null,
      dots:document.querySelectorAll('#waiting .dots span').length,
      animation:document.querySelector('#waiting .dots span')?getComputedStyle(document.querySelector('#waiting .dots span')).animationName:'none',
      winner:document.getElementById('winner').textContent,
      tieBreak:document.getElementById('tie-break')?.textContent??null,
      judgementBottom:document.getElementById('judgement').getBoundingClientRect().bottom,
      xss:window.__watch_xss===true
    })'''))

a = api('/rooms', {'name':'麦乐鸡方','agent_label':'UI 测试 A','topic':'观战体验回归测试','max_turns':4,'expected_players':2})
path = '/rooms/' + a['room']['room_id']
b = api(path + '/join', {'name':'薯条方','agent_label':'UI 测试 B'})
try:
    browse('viewport', os.environ.get('VIEWPORT', '390x640'))
    browse('goto', a['watch_url'])
    time.sleep(.4)
    check(not ui()['waiting'], '未开局不应显示发言等待动画')
    api(path + '/ready', {'ready':True}, a['player_token'])
    api(path + '/ready', {'ready':True}, b['player_token'])
    room = api(path + '/start', {}, a['player_token'])['room']
    time.sleep(.4)
    initial = ui()
    check(initial['waiting'] and '麦乐鸡方' in (initial['waitingText'] or ''), '开局应显示当前 A 的等待状态')
    check(initial['dots'] == 3 and initial['animation'] != 'none', '等待状态应有三个跳动点')
    if os.environ.get('SCREENSHOT_DIR'):
        browse('screenshot', '--viewport', str(Path(os.environ['SCREENSHOT_DIR']).resolve() / 'waiting.png'))
    for i in range(3):
        browse('js', 'window.scrollTo(0,0)')
        text = ('<script>window.__watch_xss=true</script> ' if i == 0 else '') + ('按份分享方便，回应对方的适用场景。' * 9)
        room = api(path + '/say', {'event_id':'ui-'+str(i),'turn_id':room['current_turn']['turn_id'],'text':text}, b['player_token'] if i % 2 else a['player_token'])['room']
        time.sleep(.7)
        state = ui()
        check(state['messages'] == i+1, '新消息必须实时出现')
        check(state['latestBottom'] <= state['height'] + 2, '新消息出现后最新气泡应在视口中')
        who = '薯条方' if i % 2 == 0 else '麦乐鸡方'
        check(state['waiting'] and who in (state['waitingText'] or ''), '等待状态应切换至下位发言人')
        check(not state['xss'], '观点应作为纯文本显示')
    # 更新序列但重复历史：不能追加气泡或把正在回看的观众拉回底部。
    snapshot = api(urlparse(a['watch_url']).path + '/snapshot')
    browse('js','window.scrollTo(0,0)')
    snapshot['sequence'] += 100
    browse('js','render('+json.dumps(snapshot,ensure_ascii=False)+')')
    time.sleep(.2)
    replay = ui()
    check(replay['messages'] == 3 and replay['scrollY'] == 0, '重放同样历史不得重复滚动或追加气泡')
    browse('js', 'source.close(); source.dispatchEvent(new Event("error"))')
    time.sleep(.3)
    check(not ui()['waiting'], '断线应停止发言等待动画')
    browse('reload')
    time.sleep(.6)
    check(ui()['waiting'] and ui()['messages'] == 3, '重连应补齐历史并恢复正确等待状态')
    # 只控制已校验的公开判决输入，运行真实页面 render；模型结构另有控制器测试。
    snapshot['sequence'] += 100
    snapshot['status'] = 'FINISHED'
    snapshot['current_player_id'] = None
    ids = [a['player_id'],b['player_id']]
    snapshot['judgement'] = {'status':'SUCCEEDED','result':{
        'scores':[{'player_id':p,'fit':32,'evidence':18,'response':15,'humor':8,'total':73,'reason':'完整观点'} for p in ids],
        'winner_player_id':ids[1], 'summary':'两方同分，裁判根据回应质量决胜。',
        'tie_break':{'player_id':ids[1],'reason':'第二轮回应更贴近共享场景'},
        'round_comments':[{'round':1,'comment':'立场明确'},{'round':2,'comment':'回应具体'}]}}
    browse('js','window.scrollTo(0,0); render('+json.dumps(snapshot,ensure_ascii=False)+')')
    time.sleep(.7)
    final = ui()
    check(not final['waiting'], '判决完成后不得继续显示发言等待动画')
    check(final['winner'] == '薯条方 获胜', '同分时应显示唯一胜者')
    check('第二轮回应更贴近共享场景' in (final['tieBreak'] or ''), '观众应看到同分决胜理由')
    check(final['judgementBottom'] <= final['height'] + 2, '判决出现后应滚动到结果')
    check(browse('js','String(document.documentElement.scrollWidth>innerWidth)') == 'false', '窄屏不得横向溢出')
    if os.environ.get('SCREENSHOT_DIR'):
        browse('screenshot', '--viewport', str(Path(os.environ['SCREENSHOT_DIR']).resolve() / 'judgement.png'))
    print(json.dumps({'initial':initial,'final':final,'failures':failures},ensure_ascii=False),flush=True)
    assert not failures, failures
finally:
    api(path+'/close', {}, a['player_token'])
