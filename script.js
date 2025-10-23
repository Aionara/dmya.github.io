// 全局状态管理
const app = {
    students: [],
    currentIndex: 0,
    history: [],
    weights: {},
    isRunning: false,
    currentMode: 'question',
    intervalId: null,
    timerId: null,
    remainingTime: 0,
    speechEnabled: true,
    speechRate: 1,
    voiceMode: {
        sequence: { interval: 1 },
        random: { enable3d: true, enableParticles: true },
        quick: { count: 3 },
        timer: { duration: 30 }
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initEventListeners();
    initParticles();
    updateDisplay();
    // 教程弹窗初始化：绑定ESC与遮罩点击
    setupTutorialModal();
});

// 数据持久化
function loadData() {
    const savedStudents = localStorage.getItem('students');
    if (savedStudents) {
        app.students = JSON.parse(savedStudents);
    }

    const savedHistory = localStorage.getItem('history');
    if (savedHistory) {
        app.history = JSON.parse(savedHistory);
    }

    const savedWeights = localStorage.getItem('weights');
    if (savedWeights) {
        app.weights = JSON.parse(savedWeights);
    }

    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        app.speechEnabled = settings.speechEnabled ?? true;
        app.speechRate = settings.speechRate ?? 1;
        app.voiceMode = { ...app.voiceMode, ...settings.voiceMode };
    }

    updateStudentCount();
    updateHistoryList();
}

function saveData() {
    localStorage.setItem('students', JSON.stringify(app.students));
    localStorage.setItem('history', JSON.stringify(app.history));
    localStorage.setItem('weights', JSON.stringify(app.weights));
    localStorage.setItem('settings', JSON.stringify({
        speechEnabled: app.speechEnabled,
        speechRate: app.speechRate,
        voiceMode: app.voiceMode
    }));
}

// 学生名单管理
function saveStudents() {
    const input = document.getElementById('studentInput').value;
    const lines = input.split('\n').map(line => line.trim()).filter(line => line);
    app.students = [...new Set(lines)];
    
    // 初始化权重
    app.students.forEach(name => {
        if (!app.weights[name]) {
            app.weights[name] = 1;
        }
    });
    
    updateStudentCount();
    saveData();
    showToast('名单已保存');
}

function clearStudents() {
    document.getElementById('studentInput').value = '';
    app.students = [];
    app.weights = {};
    updateStudentCount();
    saveData();
    showToast('名单已清空');
}

function exportStudents() {
    const csv = app.students.join('\n');
    downloadFile(csv, 'students.csv', 'text/csv');
}

function updateStudentCount() {
    document.getElementById('studentCount').textContent = app.students.length;
    document.getElementById('studentInput').value = app.students.join('\n');
}

// 历史记录
function addHistory(name, mode) {
    const record = {
        name,
        mode,
        time: new Date().toLocaleString('zh-CN'),
        timestamp: Date.now()
    };
    app.history.unshift(record);
    if (app.history.length > 100) {
        app.history = app.history.slice(0, 100);
    }
    updateHistoryList();
    saveData();
}

function updateHistoryList() {
    const container = document.getElementById('historyList');
    container.innerHTML = '';
    
    app.history.forEach(record => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div>
                <div>${record.name}</div>
                <div class="history-time">${record.time}</div>
            </div>
            <small>${record.mode}</small>
        `;
        container.appendChild(item);
    });
}

function clearHistory() {
    app.history = [];
    updateHistoryList();
    saveData();
    showToast('历史已清空');
}

function exportHistory() {
    const csv = app.history.map(h => `${h.time},${h.name},${h.mode}`).join('\n');
    downloadFile('时间,姓名,模式\n' + csv, 'history.csv', 'text/csv');
}

// 语音功能
function speak(text, onEnd = null) {
    if (!app.speechEnabled) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = app.speechRate;
    utterance.lang = navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US';
    
    if (onEnd) {
        utterance.onend = onEnd;
    }
    
    try {
        speechSynthesis.speak(utterance);
    } catch (error) {
        showToast('语音播放失败，请检查浏览器设置');
        // 文本闪烁提示
        const display = document.getElementById('displayName');
        display.style.animation = 'pulse 0.5s ease 3';
    }
}


function toggleVoice() {
    app.speechEnabled = !app.speechEnabled;
    const icon = document.getElementById('voiceIcon');
    const text = document.getElementById('voiceText');
    
    if (app.speechEnabled) {
        if (icon) {
            const use = icon.querySelector('use');
            if (use) use.setAttribute('href', '#icon-volume-on');
            icon.classList.remove('msr--gray');
            icon.classList.add('msr--green');
        }
        text.textContent = '语音开启';
    } else {
        if (icon) {
            const use = icon.querySelector('use');
            if (use) use.setAttribute('href', '#icon-volume-off');
            icon.classList.remove('msr--green');
            icon.classList.add('msr--gray');
        }
        text.textContent = '语音关闭';
    }
    
    saveData();
}

// 点名功能
function switchMode(mode) {
    app.currentMode = mode;
    
    // 更新标签页
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    
    // 显示对应选项
    document.querySelectorAll('.mode-options').forEach(options => {
        options.style.display = 'none';
    });
    
    const optionsMap = {
        sequence: 'sequenceOptions',
        random: 'randomOptions',
        quick: 'quickOptions',
        question: 'questionOptions',
        timer: 'timerOptions'
    };
    
    document.getElementById(optionsMap[mode]).style.display = 'block';
    
    // 重置显示
    if (!app.isRunning) {
        updateDisplay('准备开始');
    }
}

// 顺序点名
function startSequence() {
    if (app.students.length === 0) {
        showToast('请先添加学生名单');
        toggleDrawer();
        return;
    }
    
    app.isRunning = true;
    const interval = parseInt(document.getElementById('intervalSlider').value);
    
    function next() {
        if (!app.isRunning) return;
        
        const name = app.students[app.currentIndex];
        updateDisplay(name);
        addHistory(name, '顺序点名');
        speak(name, () => {
            app.currentIndex = (app.currentIndex + 1) % app.students.length;
            if (app.isRunning) {
                setTimeout(next, interval * 1000);
            }
        });
    }
    
    next();
}

function pauseSequence() {
    app.isRunning = false;
    updateDisplay('已暂停');
}

function nextStudent() {
    if (app.students.length === 0) return;
    app.currentIndex = (app.currentIndex + 1) % app.students.length;
    updateDisplay(app.students[app.currentIndex]);
}

function prevStudent() {
    if (app.students.length === 0) return;
    app.currentIndex = (app.currentIndex - 1 + app.students.length) % app.students.length;
    updateDisplay(app.students[app.currentIndex]);
}

// 随机点名 - 与上课提问功能一致
function startRandom() {
    if (app.students.length === 0) {
        showToast('请先添加学生名单');
        toggleDrawer();
        return;
    }
    
    if (app.isRunning) {
        return;
    }
    
    app.isRunning = true;
    
    // 动态闪现效果 - 与上课提问功能一致
    let flashCount = 0;
    const maxFlashes = 20; // 2秒内闪现20次，每次100ms
    
    const flashInterval = setInterval(() => {
        // 随机显示一个学生名字
        const randomIndex = Math.floor(Math.random() * app.students.length);
        const randomStudent = app.students[randomIndex];
        updateDisplay(randomStudent);
        
        flashCount++;
        
        // 2秒后停止闪现并确定最终结果
        if (flashCount >= maxFlashes) {
            clearInterval(flashInterval);
            
            // 最终随机选择一个学生
            const finalIndex = Math.floor(Math.random() * app.students.length);
            const selectedStudent = app.students[finalIndex];
            
            // 显示最终选中的学生
            updateDisplay(selectedStudent);
            addHistory(selectedStudent, '随机点名');
            
            // 播报学生姓名
            speak(selectedStudent, () => {
                app.isRunning = false;
            });
        }
    }, 100); // 每100ms切换一次
    
    // 粒子效果
    if (document.getElementById('enableParticles').checked) {
        createParticles();
    }
}


// 上课提问
function askQuestion() {
    if (app.students.length === 0) {
        showToast('请先添加学生名单');
        toggleDrawer();
        return;
    }
    
    if (app.isRunning) {
        return;
    }
    
    app.isRunning = true;
    
    // 动态闪现效果
    let flashCount = 0;
    const maxFlashes = 20; // 2秒内闪现20次，每次100ms
    
    const flashInterval = setInterval(() => {
        // 随机显示一个学生名字
        const randomIndex = Math.floor(Math.random() * app.students.length);
        const randomStudent = app.students[randomIndex];
        updateDisplay(randomStudent);
        
        flashCount++;
        
        // 2秒后停止闪现并确定最终结果
        if (flashCount >= maxFlashes) {
            clearInterval(flashInterval);
            
            // 最终随机选择一个学生
            const finalIndex = Math.floor(Math.random() * app.students.length);
            const selectedStudent = app.students[finalIndex];
            
            // 显示最终选中的学生
            updateDisplay(selectedStudent);
            addHistory(selectedStudent, '上课提问');
            
            // 播报学生姓名
            speak(selectedStudent, () => {
                app.isRunning = false;
            });
        }
    }, 100); // 每100ms切换一次
    
    // 粒子效果
    if (document.getElementById('enableQuestionParticles').checked) {
        createParticles();
    }
}

// 快速连抽
function startQuickDraw() {
    if (app.students.length === 0) {
        showToast('请先添加学生名单');
        toggleDrawer();
        return;
    }
    
    if (app.isRunning) return;
    
    const count = parseInt(document.getElementById('quickCountSlider').value);
    
    if (app.students.length < count) {
        showToast(`学生总数不足 ${count} 人`);
        return;
    }
    
    app.isRunning = true;
    
    // 开始动态闪现效果
    let flashCount = 0;
    const maxFlashes = 20; // 2秒内闪现20次
    const flashInterval = 100; // 每100毫秒闪现一次
    
    const flashTimer = setInterval(() => {
        // 随机显示一些名字进行闪现
        const flashNames = [];
        for (let i = 0; i < count; i++) {
            const randomName = app.students[Math.floor(Math.random() * app.students.length)];
            flashNames.push(randomName);
        }
        updateDisplay(flashNames.join('、'));
        
        flashCount++;
        if (flashCount >= maxFlashes) {
            clearInterval(flashTimer);
            
            // 闪现结束，进行最终选择
            const selected = selectMultipleStudents(app.students, count);
            
            // 显示所有选中的名字
            const allNames = selected.join('、');
            updateDisplay(allNames);
            
            // 逐个播报和记录
            selected.forEach((name, index) => {
                setTimeout(() => {
                    addHistory(name, '快速连抽');
                    speak(name);
                    
                    // 如果是最后一个，结束运行状态
                    if (index === selected.length - 1) {
                        setTimeout(() => {
                            app.isRunning = false;
                        }, 1000);
                    }
                }, index * 800);
            });
        }
    }, flashInterval);
}

function selectMultipleStudents(candidates, count) {
    const selected = [];
    const tempCandidates = [...candidates];
    
    for (let i = 0; i < count && tempCandidates.length > 0; i++) {
        // 简单随机选择，不重复
        const randomIndex = Math.floor(Math.random() * tempCandidates.length);
        selected.push(tempCandidates[randomIndex]);
        tempCandidates.splice(randomIndex, 1);
    }
    
    return selected;
}


function getCallCount(name) {
    return app.history.filter(h => h.name === name).length;
}

// 计时器
function startTimer() {
    const select = document.getElementById('timerSelect');
    let duration = parseInt(select.value);
    
    if (select.value === 'custom') {
        duration = parseInt(document.getElementById('customTimer').value);
        if (!duration || duration < 1) {
            showToast('请输入有效的时间');
            return;
        }
    }
    
    app.remainingTime = duration;
    app.isRunning = true;
    
    document.getElementById('timerDisplay').style.display = 'block';
    document.getElementById('displayName').style.display = 'none';
    
    function updateTimer() {
        if (!app.isRunning) return;
        
        const minutes = Math.floor(app.remainingTime / 60);
        const seconds = app.remainingTime % 60;
        document.getElementById('timerDisplay').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // 每分钟报时
        if (app.remainingTime > 0 && app.remainingTime % 60 === 0 && app.speechEnabled) {
            speak(`${minutes}分钟剩余`);
        }
        
        if (app.remainingTime <= 0) {
            speak('时间到！');
            pauseTimer();
            return;
        }
        
        app.remainingTime--;
        app.timerId = setTimeout(updateTimer, 1000);
    }
    
    updateTimer();
}

function pauseTimer() {
    app.isRunning = false;
    if (app.timerId) {
        clearTimeout(app.timerId);
        app.timerId = null;
    }
    document.getElementById('timerDisplay').style.display = 'none';
    document.getElementById('displayName').style.display = 'block';
    updateDisplay('计时结束');
}

// UI 更新 - 优化版本
function updateDisplay(text) {
    const displayElement = document.getElementById('displayName');
    const displayText = text || '准备开始';

    requestAnimationFrame(() => {
        const classList = displayElement.classList;

        // 清理多名称相关类
        for (let i = 1; i <= 10; i++) {
            classList.remove(`names-${i}`);
        }
        classList.remove('multi-names');
        // 同步容器紧凑布局类
        const card = document.getElementById('mainCard');
        if (card) {
            card.classList.remove('compact', 'compact-10');
        }

        // 处理多名称（以、分隔）
        const isMulti = displayText.includes('、');
        if (isMulti) {
            const names = displayText.split('、').filter(n => n && n.trim());
            const count = Math.min(Math.max(names.length, 1), 10);

            displayElement.innerHTML = '';
            names.forEach((name) => {
                const span = document.createElement('span');
                span.className = 'name-item';
                span.textContent = name;
                displayElement.appendChild(span);
            });

            classList.add('multi-names');
            classList.add(`names-${count}`);

            // 针对多名称容器减小内边距以提升可用宽度
            if (card) {
                card.classList.add('compact');
                if (count === 10) {
                    card.classList.add('compact-10');
                }
            }

            // 长度类对多名称无意义，直接返回
            return;
        }

        // 单名称：使用文本长度自适应类
        displayElement.textContent = displayText;

        const textLength = displayText.length;
        classList.remove('long-text', 'very-long-text', 'extra-long-text');
        if (textLength > 30) {
            classList.add('extra-long-text');
        } else if (textLength > 20) {
            classList.add('very-long-text');
        } else if (textLength > 10) {
            classList.add('long-text');
        }

        // 单名称时恢复卡片默认内边距
        if (card) {
            card.classList.remove('compact', 'compact-10');
        }
    });
}

// 抽屉控制
function toggleDrawer() {
    document.getElementById('studentDrawer').classList.toggle('open');
}

function closeDrawer() {
    document.getElementById('studentDrawer').classList.remove('open');
}

function toggleHistory() {
    document.getElementById('historyDrawer').classList.toggle('open');
}

function closeHistory() {
    document.getElementById('historyDrawer').classList.remove('open');
}

// 主题切换
function switchTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const targetBtn = (event && (event.currentTarget || (event.target && event.target.closest && event.target.closest('.theme-btn')))) || null;
    if (targetBtn) {
        targetBtn.classList.add('active');
    }
    saveData();
}

// 动画效果
function createBarrage(text) {
    const item = document.createElement('div');
    item.className = 'barrage-item';
    item.textContent = text;
    
    const top = Math.random() * (window.innerHeight - 200) + 100;
    item.style.top = `${top}px`;
    
    document.getElementById('barrageContainer').appendChild(item);
    
    setTimeout(() => {
        item.remove();
    }, 3000);
}

function createParticles() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    
    // 缓存canvas尺寸，避免重复计算
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    const particles = [];
    const particleCount = 30; // 减少粒子数量提升性能
    
    // 预计算颜色，避免重复计算
    const colors = [];
    for (let i = 0; i < particleCount; i++) {
        colors.push(`hsl(${Math.random() * 360}, 70%, 50%)`);
    }
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * canvasWidth,
            y: Math.random() * canvasHeight,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 2 + 1, // 减小粒子大小
            color: colors[i]
        });
    }
    
    let animationId;
    let startTime = Date.now();
    const duration = 3000; // 3秒后自动停止
    
    function animate() {
        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        
        // 如果超过持续时间或应用停止运行，停止动画
        if (elapsed > duration || !app.isRunning) {
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            return;
        }
        
        // 使用离屏canvas优化性能
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // 批量绘制粒子，减少函数调用
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            
            // 边界检测优化
            if (p.x < 0 || p.x > canvasWidth) p.vx *= -1;
            if (p.y < 0 || p.y > canvasHeight) p.vy *= -1;
            
            // 使用更高效的绘制方式
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        animationId = requestAnimationFrame(animate);
    }
    
    animate();
}

function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // 简单的背景粒子
    function drawBackground() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.arc(
                Math.random() * canvas.width,
                Math.random() * canvas.height,
                Math.random() * 2 + 1,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fill();
        }
    }
    
    drawBackground();
}

// 事件监听器
function initEventListeners() {
    // 滑块事件
    document.getElementById('intervalSlider').addEventListener('input', (e) => {
        document.getElementById('intervalValue').textContent = e.target.value;
        app.voiceMode.sequence.interval = parseInt(e.target.value);
    });

    document.getElementById('quickCountSlider').addEventListener('input', (e) => {
        document.getElementById('quickCountValue').textContent = e.target.value;
        app.voiceMode.quick.count = parseInt(e.target.value);
    });

    document.getElementById('speechRateSlider').addEventListener('input', (e) => {
        document.getElementById('speechRateValue').textContent = e.target.value;
        app.speechRate = parseFloat(e.target.value);
        saveData();
    });

    document.getElementById('timerSelect').addEventListener('change', (e) => {
        const customInput = document.getElementById('customTimer');
        customInput.style.display = e.target.value === 'custom' ? 'inline-block' : 'none';
    });

    // 文件拖拽
    const studentInput = document.getElementById('studentInput');
    studentInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        studentInput.style.borderColor = 'var(--primary)';
    });

    studentInput.addEventListener('dragleave', () => {
        studentInput.style.borderColor = 'var(--border)';
    });

    studentInput.addEventListener('drop', (e) => {
        e.preventDefault();
        studentInput.style.borderColor = 'var(--border)';
        
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'text/csv') {
            const reader = new FileReader();
            reader.onload = (e) => {
                studentInput.value = e.target.result.split('\n').join('\n');
            };
            reader.readAsText(file);
        }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key) {
            case ' ':
                e.preventDefault();
                handleStartPause();
                break;
            case 'n':
            case 'N':
                nextStudent();
                break;
            case 'r':
            case 'R':
                if (app.currentMode === 'random') startRandom();
                break;
            case 'b':
            case 'B':
                if (app.currentMode === 'quick') startQuickDraw();
                break;
            case 't':
            case 'T':
                switchMode('timer');
                break;
            case 'c':
            case 'C':
                if (confirm('确定要清空历史记录吗？')) {
                    clearHistory();
                }
                break;
        }
    });

    // Konami 彩蛋
    let konamiCode = [];
    const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    
    document.addEventListener('keydown', (e) => {
        konamiCode.push(e.code);
        if (konamiCode.length > konamiSequence.length) {
            konamiCode = konamiCode.slice(1);
        }
        
        if (konamiCode.join('') === konamiSequence.join('')) {
            triggerEasterEgg();
            konamiCode = [];
        }
    });
}

// 教程弹窗
function openTutorial() {
    const backdrop = document.getElementById('tutorialBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'flex';
}

function closeTutorial() {
    const backdrop = document.getElementById('tutorialBackdrop');
    if (!backdrop) return;
    backdrop.style.display = 'none';
}

function setupTutorialModal() {
    const backdrop = document.getElementById('tutorialBackdrop');
    if (!backdrop) return;
    // 点击遮罩关闭（但点击内容区域不关闭）
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeTutorial();
        }
    });
    // ESC 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const isOpen = backdrop.style.display !== 'none';
            if (isOpen) closeTutorial();
        }
    });
}

function handleStartPause() {
    switch(app.currentMode) {
        case 'sequence':
            if (app.isRunning) {
                pauseSequence();
            } else {
                startSequence();
            }
            break;
        case 'random':
            if (!app.isRunning) startRandom();
            break;
        case 'quick':
            if (!app.isRunning) startQuickDraw();
            break;
        case 'question':
            if (!app.isRunning) askQuestion();
            break;
        case 'timer':
            if (app.isRunning) {
                pauseTimer();
            } else {
                startTimer();
            }
            break;
    }
}

function triggerEasterEgg() {
    showToast('🌈 彩蛋触发！彩虹粒子启动！');
    
    // 创建彩虹粒子
    const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    let frame = 0;
    function rainbowEffect() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < app.students.length; i++) {
            const x = (canvas.width / app.students.length) * i;
            const y = canvas.height / 2 + Math.sin(frame * 0.1 + i) * 100;
            
            ctx.font = '24px Arial';
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillText(app.students[i], x, y);
        }
        
        frame++;
        if (frame < 300) {
            requestAnimationFrame(rainbowEffect);
        } else {
            initParticles();
        }
    }
    
    rainbowEffect();
    
    // 控制台 ASCII Art
    console.log(`
╔═╗┌─┐┌┐ ┌─┐┬ ┬
║  ├┤ ├┴┐│ │└┬┘
╚═╝└─┘└─┘└─┘ ┴ 
    `);
}

// 工具函数
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function resetAll() {
    if (confirm('确定要重置所有数据吗？')) {
        app.students = [];
        app.history = [];
        app.weights = {};
        app.currentIndex = 0;
        app.isRunning = false;
        
        if (app.intervalId) clearInterval(app.intervalId);
        if (app.timerId) clearTimeout(app.timerId);
        
        updateDisplay('准备开始');
        updateStudentCount();
        updateHistoryList();
        saveData();
        showToast('已重置全部数据');
    }
}

// 渲染左侧名单下的学生快捷按钮
function renderStudentButtons() {
    const container = document.getElementById('studentButtons');
    if (!container) return;
    container.innerHTML = '';

    // 优先使用内存中的 app.students（loadData 已同步）
    const students = Array.isArray(app.students) ? app.students : [];

    const countNode = document.getElementById('studentCount');
    if (countNode) countNode.textContent = students.length;

    if (students.length === 0) {
        container.innerHTML = '<small style="color:#888">名单为空，保存名单后可在此直接点名。</small>';
        return;
    }

    students.forEach(name => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary btn-sm';
        btn.textContent = name;
        btn.title = `呼叫 ${name}`;
        btn.onclick = () => callStudent(name);
        btn.style.padding = '6px 10px';
        btn.style.fontSize = '13px';
        container.appendChild(btn);
    });
}

// 点击按钮直接叫号
function callStudent(name) {
    if (!name) return;

    // 在主舞台显示
    const display = document.getElementById('displayName');
    if (display) {
        display.textContent = `请 ${name} 到办公室`;
    }

    // 显示 3D 卡片（如有）
    const card3d = document.getElementById('card3d');
    if (card3d) {
        card3d.style.display = 'block';
        card3d.classList.add('called-flash');
        setTimeout(() => {
            card3d.classList.remove('called-flash');
            // 根据需要可隐藏卡片，保持与现有行为一致
            // card3d.style.display = 'none';
        }, 800);
    }

    // 语音播报
    if (app.speechEnabled) {
        try {
            // 先取消已有播报
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            speak(`请 ${name} 到办公室`);
        } catch (e) { /* ignore */ }
    }

    // 记录历史
    addHistory(name, '手动叫号');
    // 可选：添加弹幕或特效
    //createBarrage && createBarrage(`请 ${name} 到办公室来`);
}