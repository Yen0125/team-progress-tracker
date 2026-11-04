import json
import os
import re
import socket
import threading
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "store.json")
STATIC_DIR = os.path.join(BASE_DIR, "public")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

STORE_LOCK = threading.Lock()

DIFFICULTY_WEIGHTS = {
    "low": {"weight": 1, "points": 10, "label": "低難度 (1x)"},
    "medium": {"weight": 2, "points": 20, "label": "中難度 (2x)"},
    "high": {"weight": 3, "points": 30, "label": "高難度 (3x)"},
}


def get_default_data():
    today = datetime.now().date()

    def rel_date(days):
        return (today + timedelta(days=days)).isoformat()

    return {
        "project": {
            "title": "期末專題：AI 專長適性分工與小組進度追蹤系統研究",
            "course": "資訊管理專題實作 (第 04 組)",
            "deadline": rel_date(14),
            "accessCode": "team2026",
            "requirePasscode": False,
            "updatedAt": datetime.now().isoformat(),
        },
        "members": [
            {
                "id": "m1",
                "name": "林宥辰",
                "role": "組長 / 系統架構",
                "avatarColor": "#2563eb",
                "skills": ["系統程式開發", "API 串接", "技術文件撰寫"],
                "preferences": ["系統程式開發", "架構設計"],
                "avoid": ["美編排版"],
                "capacityPoints": 60,
                "note": "擅長前後端邏輯與系統整合，偏好負責核心功能實作",
            },
            {
                "id": "m2",
                "name": "陳語彤",
                "role": "UI/UX 與前端設計",
                "avatarColor": "#db2777",
                "skills": ["UI/UX 與視覺設計", "響應式網頁排版", "簡報製作與排版"],
                "preferences": ["UI/UX 與視覺設計", "原型設計"],
                "avoid": ["資料庫正規化"],
                "capacityPoints": 60,
                "note": "重視使用者體驗與手機電腦雙端版面美感",
            },
            {
                "id": "m3",
                "name": "張哲瑋",
                "role": "數據分析與演算法",
                "avatarColor": "#059669",
                "skills": ["數據分析與圖表", "AI 提示詞工程", "問卷統計分析"],
                "preferences": ["數據分析與圖表", "AI 提示詞工程"],
                "avoid": ["上台口頭報告"],
                "capacityPoints": 60,
                "note": "擅長量化指標設計與 AI 分工權重模型推導",
            },
            {
                "id": "m4",
                "name": "黃詩涵",
                "role": "文獻研究與內容統整",
                "avatarColor": "#d97706",
                "skills": ["資料蒐集與文獻整理", "文案撰寫與統整", "會議紀錄與進度追蹤"],
                "preferences": ["資料蒐集與文獻整理", "文案撰寫與統整"],
                "avoid": ["系統程式開發"],
                "capacityPoints": 60,
                "note": "細心負責，擅長文獻探討、研究方法撰寫與報告文字潤飾",
            },
            {
                "id": "m5",
                "name": "周柏翰",
                "role": "簡報展演與測試驗證",
                "avatarColor": "#7c3aed",
                "skills": ["口頭報告與表達", "簡報製作與排版", "系統測試與除錯"],
                "preferences": ["口頭報告與表達", "系統測試與除錯"],
                "avoid": ["文獻理論推導"],
                "capacityPoints": 60,
                "note": "台風穩健、邏輯清晰，負責專題發表與跨裝置實測驗證",
            },
        ],
        "tasks": [
            {
                "id": "t1",
                "title": "國內外團隊協作與分工具文獻探討",
                "description": "蒐集近五年同儕互評、社會賦閒效應（Social Loafing）與 AI 輔助任務分派之研究文獻並完成第二章草稿。",
                "requiredSkills": ["資料蒐集與文獻整理", "文案撰寫與統整"],
                "difficulty": "low",
                "status": "done",
                "progress": 100,
                "dueDate": rel_date(-3),
                "assigneeId": "m4",
                "collaboratorIds": [],
                "aiReason": "黃詩涵同時具備「資料蒐集與文獻整理」與「文案撰寫與統整」兩項核心專長，且完全符合個人偏好。",
            },
            {
                "id": "t2",
                "title": "專題研究架構與訪談問卷題目擬定",
                "description": "整理大學生小組報告常見痛點，設計需求訪談大綱與前測問卷題項。",
                "requiredSkills": ["資料蒐集與文獻整理", "問卷統計分析"],
                "difficulty": "low",
                "status": "done",
                "progress": 100,
                "dueDate": rel_date(-1),
                "assigneeId": "m4",
                "collaboratorIds": ["m3"],
                "aiReason": "由黃詩涵主責文獻與題項文字、張哲瑋協作統計量表設計，發揮跨專長互補。",
            },
            {
                "id": "t3",
                "title": "AI 專長適性配對與多維度貢獻權重模型設計",
                "description": "設計結合難度權重（1x/2x/3x）、進度百分比與負載平衡之量化演算法與 AI Prompt 結構。",
                "requiredSkills": ["數據分析與圖表", "AI 提示詞工程"],
                "difficulty": "high",
                "status": "in_progress",
                "progress": 85,
                "dueDate": rel_date(2),
                "assigneeId": "m3",
                "collaboratorIds": ["m1"],
                "aiReason": "此為高難度核心任務（3x 權重），張哲瑋完全匹配「數據分析與圖表」及「AI 提示詞工程」專長與偏好。",
            },
            {
                "id": "t4",
                "title": "平台後端 API 與即時進度計算引擎開發",
                "description": "實作組員管理、任務難度加權計算、AI 分工建議 API 與資料持久化儲存機制。",
                "requiredSkills": ["系統程式開發", "API 串接"],
                "difficulty": "high",
                "status": "in_progress",
                "progress": 80,
                "dueDate": rel_date(3),
                "assigneeId": "m1",
                "collaboratorIds": [],
                "aiReason": "林宥辰具備「系統程式開發」與「API 串接」專長，承擔此 3x 高難度開發任務最為合適。",
            },
            {
                "id": "t5",
                "title": "響應式透明化進度看板與互動介面實作",
                "description": "設計支援電腦與手機版的任務看板、貢獻度視覺化圖表與 AI 分工微調介面。",
                "requiredSkills": ["UI/UX 與視覺設計", "響應式網頁排版"],
                "difficulty": "high",
                "status": "review",
                "progress": 90,
                "dueDate": rel_date(1),
                "assigneeId": "m2",
                "collaboratorIds": ["m1"],
                "aiReason": "陳語彤專精於「UI/UX 與視覺設計」及「響應式網頁排版」，目前進度已達 90% 進入審閱階段。",
            },
            {
                "id": "t6",
                "title": "手機與電腦雙端可用性測試與問題修正紀錄",
                "description": "針對不同螢幕尺寸驗證新增組員、AI 配對調整、滑桿更新進度等完整操作流程並撰寫測試報告。",
                "requiredSkills": ["系統測試與除錯", "技術文件撰寫"],
                "difficulty": "medium",
                "status": "in_progress",
                "progress": 60,
                "dueDate": rel_date(5),
                "assigneeId": "m5",
                "collaboratorIds": ["m2"],
                "aiReason": "周柏翰具備「系統測試與除錯」專長與偏好，搭配陳語彤協助檢視雙端介面細節。",
            },
            {
                "id": "t7",
                "title": "前測與後測使用者評估數據統計圖表繪製",
                "description": "比較傳統件數計算與本平台加權透明看板對組員公平感認知之差異圖表。",
                "requiredSkills": ["數據分析與圖表", "問卷統計分析"],
                "difficulty": "medium",
                "status": "todo",
                "progress": 20,
                "dueDate": rel_date(7),
                "assigneeId": "m3",
                "collaboratorIds": [],
                "aiReason": "與張哲瑋之統計分析專長高度契合，能在模型完成後無縫銜接圖表產出。",
            },
            {
                "id": "t8",
                "title": "期末專題成果簡報製作與口頭發表彩排",
                "description": "統整問題意識、系統實機展示流程與量化成效，製作 15 分鐘發表簡報並進行 Q&A 演練。",
                "requiredSkills": ["簡報製作與排版", "口頭報告與表達", "文案撰寫與統整"],
                "difficulty": "medium",
                "status": "todo",
                "progress": 15,
                "dueDate": rel_date(10),
                "assigneeId": "m5",
                "collaboratorIds": ["m4", "m2"],
                "aiReason": "周柏翰具備「口頭報告與表達」及「簡報製作與排版」雙專長，結合黃詩涵與陳語彤共同完善。",
            },
        ],
    }


def load_store():
    with STORE_LOCK:
        if not os.path.exists(DATA_FILE):
            default_data = get_default_data()
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(default_data, f, ensure_ascii=False, indent=2)
            return default_data
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            default_data = get_default_data()
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(default_data, f, ensure_ascii=False, indent=2)
            return default_data


def save_store(data):
    with STORE_LOCK:
        data["project"]["updatedAt"] = datetime.now().isoformat()
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return data


def normalize_token(text):
    return re.sub(r"\s+", "", str(text or "")).lower()


def skill_similarity(req_skill, member_skill):
    r = normalize_token(req_skill)
    m = normalize_token(member_skill)
    if not r or not m:
        return 0.0
    if r == m:
        return 1.0
    if r in m or m in r:
        return 0.85
    # Common semantic groups in Chinese student projects
    groups = [
        {"系統程式開發", "程式", "前端", "後端", "api串接", "架構", "開發", "coding", "全端"},
        {"ui/ux與視覺設計", "響應式網頁排版", "設計", "美編", "排版", "原型設計", "figma", "視覺"},
        {"數據分析與圖表", "問卷統計分析", "ai提示詞工程", "統計", "分析", "資料分析", "圖表", "演算法"},
        {"資料蒐集與文獻整理", "文案撰寫與統整", "文獻", "報告撰寫", "文字", "技術文件撰寫", "會議紀錄與進度追蹤"},
        {"口頭報告與表達", "簡報製作與排版", "上台", "報告", "簡報", "展演", "發表"},
        {"系統測試與除錯", "測試", "除錯", "qa", "驗證"},
    ]
    for g in groups:
        r_hit = any(k in r or r in k for k in g)
        m_hit = any(k in m or m in k for k in g)
        if r_hit and m_hit:
            return 0.65
    # Character bigram overlap fallback
    r_chars = set(r)
    m_chars = set(m)
    overlap = len(r_chars & m_chars) / max(len(r_chars | m_chars), 1)
    return 0.45 if overlap >= 0.35 else 0.0


def compute_builtin_ai_suggestions(members, tasks, mode="all"):
    """
    Adaptive AI Task Allocation Algorithm:
    Evaluates:
      1. Required Skill Match (0 - 55 pts)
      2. Personal Preference Bonus (0 - 20 pts)
      3. Avoid List Penalty (-25 pts)
      4. Dynamic Workload Balance Score (0 - 25 pts) considering task difficulty weights (10/20/30 pts)
    """
    if not members:
        return []

    # Track simulated assigned points for fair load balancing
    simulated_load = {m["id"]: 0.0 for m in members}
    simulated_high_count = {m["id"]: 0 for m in members}

    # If mode == "unassigned_only", pre-populate load from already assigned tasks
    for t in tasks:
        diff_info = DIFFICULTY_WEIGHTS.get(t.get("difficulty", "medium"), DIFFICULTY_WEIGHTS["medium"])
        if mode == "unassigned_only" and t.get("assigneeId") in simulated_load:
            simulated_load[t["assigneeId"]] += diff_info["points"]
            if t.get("difficulty") == "high":
                simulated_high_count[t["assigneeId"]] += 1

    # Sort tasks by difficulty descending (allocate high-difficulty 3x tasks first so load balances fairly)
    difficulty_order = {"high": 3, "medium": 2, "low": 1}
    sorted_tasks = sorted(
        tasks,
        key=lambda x: (
            difficulty_order.get(x.get("difficulty", "medium"), 2),
            len(x.get("requiredSkills", [])),
        ),
        reverse=True,
    )

    suggestions_by_task = {}

    for task in sorted_tasks:
        t_id = task["id"]
        diff_key = task.get("difficulty", "medium")
        diff_info = DIFFICULTY_WEIGHTS.get(diff_key, DIFFICULTY_WEIGHTS["medium"])
        task_points = diff_info["points"]
        req_skills = task.get("requiredSkills", []) or []

        if mode == "unassigned_only" and task.get("assigneeId"):
            # Keep existing assignee but still compute explanation & score
            pass

        candidate_Rankings = []
        avg_load = sum(simulated_load.values()) / max(len(members), 1)

        for m in members:
            m_id = m["id"]
            m_skills = m.get("skills", []) or []
            m_prefs = m.get("preferences", []) or []
            m_avoid = m.get("avoid", []) or []
            capacity = max(float(m.get("capacityPoints", 60) or 60), 20.0)

            # 1. Skill Match (0 to 55)
            matched_skills = []
            partial_skills = []
            if req_skills:
                skill_scores = []
                for req in req_skills:
                    best_sim = 0.0
                    best_ms = ""
                    for ms in m_skills:
                        sim = skill_similarity(req, ms)
                        if sim > best_sim:
                            best_sim = sim
                            best_ms = ms
                    skill_scores.append(best_sim)
                    if best_sim >= 0.85:
                        matched_skills.append(req if req == best_ms else f"{req}（具備：{best_ms}）")
                    elif best_sim >= 0.45:
                        partial_skills.append(f"{req}（相關：{best_ms}）")
                raw_skill_ratio = sum(skill_scores) / len(req_skills)
            else:
                raw_skill_ratio = 0.6

            skill_score = raw_skill_ratio * 55.0

            # 2. Preference Bonus (0 to 20)
            pref_hits = []
            for req in req_skills + [task.get("title", "")]:
                for pref in m_prefs:
                    if skill_similarity(req, pref) >= 0.65:
                        if pref not in pref_hits:
                            pref_hits.append(pref)
            pref_score = min(len(pref_hits) * 12.0, 20.0)

            # 3. Avoid Penalty
            avoid_hits = []
            for req in req_skills + [task.get("title", "")]:
                for av in m_avoid:
                    if skill_similarity(req, av) >= 0.65:
                        if av not in avoid_hits:
                            avoid_hits.append(av)
            avoid_penalty = len(avoid_hits) * 22.0

            # 4. Workload Balance Score (0 to 25)
            current_load = simulated_load[m_id]
            projected_load = current_load + task_points
            load_ratio = current_load / capacity
            # Reward members with lower current weighted load
            balance_score = max(0.0, 25.0 * (1.0 - (load_ratio * 0.75)))
            if current_load <= avg_load:
                balance_score = min(25.0, balance_score + 4.0)
            if diff_key == "high" and simulated_high_count[m_id] >= 1:
                balance_score -= 6.0 * simulated_high_count[m_id]

            total_score = round(max(12.0, min(99.0, skill_score + pref_score + balance_score - avoid_penalty)))

            # Build transparent human-readable explanation
            reason_parts = []
            if matched_skills:
                reason_parts.append(f"專長完全契合「{'、'.join(matched_skills)}」")
            elif partial_skills:
                reason_parts.append(f"具備相關能力「{'、'.join(partial_skills)}」")
            else:
                reason_parts.append("可作為跨領域支援人選")

            if pref_hits:
                reason_parts.append(f"符合個人偏好（{'、'.join(pref_hits)}）")
            if avoid_hits:
                reason_parts.append(f"注意：觸及較不擅長項目（{'、'.join(avoid_hits)}）")

            reason_parts.append(
                f"考量此任務為{diff_info['label']}（{task_points}點），指派前加權負載為 {int(current_load)} 點，指派後預估 {int(projected_load)} 點，整體團隊負載最均衡。"
            )

            candidate_Rankings.append(
                {
                    "memberId": m_id,
                    "memberName": m["name"],
                    "score": total_score,
                    "skillScore": round(skill_score, 1),
                    "prefScore": round(pref_score, 1),
                    "balanceScore": round(balance_score, 1),
                    "currentLoadPoints": int(current_load),
                    "projectedLoadPoints": int(projected_load),
                    "matchedSkills": matched_skills,
                    "reason": "；".join(reason_parts),
                }
            )

        candidate_Rankings.sort(key=lambda c: c["score"], reverse=True)
        best = candidate_Rankings[0]
        runner_up = candidate_Rankings[1] if len(candidate_Rankings) > 1 else None

        chosen_id = best["memberId"]
        if mode == "unassigned_only" and task.get("assigneeId"):
            chosen_id = task["assigneeId"]
        else:
            simulated_load[chosen_id] += task_points
            if diff_key == "high":
                simulated_high_count[chosen_id] += 1

        # Suggest collaborator for high/medium difficulty if runner-up has strong complementary skill
        suggested_collaborators = []
        if runner_up and diff_key in ("high", "medium") and runner_up["score"] >= 60:
            suggested_collaborators.append(runner_up["memberId"])

        suggestions_by_task[t_id] = {
            "taskId": t_id,
            "taskTitle": task.get("title", ""),
            "difficulty": diff_key,
            "difficultyPoints": task_points,
            "currentAssigneeId": task.get("assigneeId"),
            "recommendedAssigneeId": best["memberId"],
            "recommendedMemberName": best["memberName"],
            "matchScore": best["score"],
            "reason": best["reason"],
            "recommendedCollaboratorIds": suggested_collaborators,
            "candidates": candidate_Rankings,
            "engine": "builtin_adaptive_v2",
        }

    # Return in original task order
    return [suggestions_by_task[t["id"]] for t in tasks if t["id"] in suggestions_by_task]


def call_gemini_ai_suggestions(api_key, members, tasks, model_name="gemini-2.5-flash"):
    """
    Calls Google Gemini API to generate adaptive task allocation recommendations,
    falling back or enriching with candidate scores so the UI remains 100% interactive.
    """
    baseline = compute_builtin_ai_suggestions(members, tasks, mode="all")
    baseline_map = {item["taskId"]: item for item in baseline}

    prompt = f"""你是一位專業的「大學專題團隊敏捷教練與 AI 適性分工顧問」。
請根據以下組員的「專長 (skills)」、「偏好 (preferences)」、「不擅長項目 (avoid)」與「容量點數」，以及各項任務的「所需專長 (requiredSkills)」與「難度權重 (low=10點, medium=20點, high=30點)」，為每個任務推薦最適合的主要負責人 (recommendedAssigneeId) 與協作支援者 (recommendedCollaboratorIds)。

分配原則：
1. 優先匹配任務所需專長與組員核心專長、偏好。
2. 避免只看任務件數，必須根據「難度權重（高難度30點、中難度20點、低難度10點）」平衡每位組員的總加權負載點數。
3. 請用繁體中文針對每項任務給出具體、有說服力的配對理由 (reason，約 45~90 字)，說明專長契合度與加權負載考量。

組員資料 JSON:
{json.dumps(members, ensure_ascii=False)}

任務資料 JSON:
{json.dumps(tasks, ensure_ascii=False)}

請只回傳純 JSON 陣列（不要加 markdown 語法），格式如下：
[
  {{
    "taskId": "任務ID",
    "recommendedAssigneeId": "組員ID",
    "recommendedCollaboratorIds": ["協作組員ID"],
    "matchScore": 92,
    "reason": "繁體中文配對理由..."
  }}
]
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        resp_body = json.loads(resp.read().decode("utf-8"))

    text_out = (
        resp_body.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "[]")
    )
    text_out = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_out.strip())
    parsed = json.loads(text_out)
    member_name_map = {m["id"]: m["name"] for m in members}

    merged = []
    parsed_map = {item.get("taskId"): item for item in parsed if isinstance(item, dict)}

    for t in tasks:
        t_id = t["id"]
        base_item = baseline_map.get(t_id, {}).copy()
        gem_item = parsed_map.get(t_id)
        if gem_item and gem_item.get("recommendedAssigneeId") in member_name_map:
            rec_id = gem_item["recommendedAssigneeId"]
            base_item["recommendedAssigneeId"] = rec_id
            base_item["recommendedMemberName"] = member_name_map[rec_id]
            base_item["matchScore"] = int(gem_item.get("matchScore", base_item.get("matchScore", 90)))
            base_item["reason"] = gem_item.get("reason") or base_item.get("reason")
            if isinstance(gem_item.get("recommendedCollaboratorIds"), list):
                base_item["recommendedCollaboratorIds"] = [
                    cid for cid in gem_item["recommendedCollaboratorIds"] if cid in member_name_map and cid != rec_id
                ]
            base_item["engine"] = f"gemini_api ({model_name})"
        merged.append(base_item)

    return merged


class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        # Prevent public search indexing & enable private access headers
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Access-Code")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/robots.txt":
            body = b"User-agent: *\nDisallow: /\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/api/state":
            data = load_store()
            self.send_json(200, {"ok": True, "data": data})
            return

        if parsed.path == "/api/health":
            self.send_json(200, {"ok": True, "status": "running", "timestamp": datetime.now().isoformat()})
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body = self.read_json_body()
        except Exception as e:
            self.send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})
            return

        if parsed.path == "/api/state":
            if not isinstance(body, dict) or "members" not in body or "tasks" not in body:
                self.send_json(400, {"ok": False, "error": "Missing members or tasks in state payload"})
                return
            current = load_store()
            current["project"] = body.get("project", current.get("project", {}))
            current["members"] = body["members"]
            current["tasks"] = body["tasks"]
            saved = save_store(current)
            self.send_json(200, {"ok": True, "data": saved})
            return

        if parsed.path == "/api/reset":
            mode = body.get("mode", "demo")
            if mode == "empty":
                empty_data = get_default_data()
                empty_data["members"] = []
                empty_data["tasks"] = []
                saved = save_store(empty_data)
            else:
                saved = save_store(get_default_data())
            self.send_json(200, {"ok": True, "data": saved})
            return

        if parsed.path == "/api/ai-suggest":
            state = load_store()
            members = body.get("members", state.get("members", []))
            tasks = body.get("tasks", state.get("tasks", []))
            engine_mode = body.get("engineMode", "builtin")  # "builtin" or "gemini"
            api_key = (body.get("apiKey") or "").strip()
            alloc_scope = body.get("scope", "all")

            if engine_mode == "gemini" and api_key:
                try:
                    suggestions = call_gemini_ai_suggestions(api_key, members, tasks)
                    self.send_json(
                        200,
                        {
                            "ok": True,
                            "engineUsed": "gemini",
                            "message": "已透過 Gemini API 產生專長適性分工建議",
                            "suggestions": suggestions,
                        },
                    )
                    return
                except urllib.error.HTTPError as he:
                    err_detail = he.read().decode("utf-8", errors="ignore")
                    fallback = compute_builtin_ai_suggestions(members, tasks, mode=alloc_scope)
                    self.send_json(
                        200,
                        {
                            "ok": True,
                            "engineUsed": "builtin_fallback",
                            "warning": f"Gemini API 呼叫失敗 ({he.code})，已自動切換為內建智慧配對引擎。原因：{err_detail[:180]}",
                            "suggestions": fallback,
                        },
                    )
                    return
                except Exception as ex:
                    fallback = compute_builtin_ai_suggestions(members, tasks, mode=alloc_scope)
                    self.send_json(
                        200,
                        {
                            "ok": True,
                            "engineUsed": "builtin_fallback",
                            "warning": f"Gemini API 連線異常，已自動切換為內建智慧配對引擎 ({ex})",
                            "suggestions": fallback,
                        },
                    )
                    return

            suggestions = compute_builtin_ai_suggestions(members, tasks, mode=alloc_scope)
            self.send_json(
                200,
                {
                    "ok": True,
                    "engineUsed": "builtin",
                    "message": "已透過內建多維度專長適性與加權負載平衡引擎產生建議",
                    "suggestions": suggestions,
                },
            )
            return

        self.send_json(404, {"ok": False, "error": "Endpoint not found"})


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8088))
    load_store()
    lan_ip = get_lan_ip()
    server = ThreadingHTTPServer(("0.0.0.0", port), AppRequestHandler)
    print(f"============================================================")
    print(f" 小組報告進度追蹤平台 (Private Prototype Server) 已啟動")
    print(f" 本機存取網址 (Desktop): http://localhost:{port}/?token=team2026")
    print(f" 區網私密網址 (LAN/手機): http://{lan_ip}:{port}/?token=team2026")
    print(f"============================================================", flush=True)
    server.serve_forever()
