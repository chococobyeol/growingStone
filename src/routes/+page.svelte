<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { currentStone } from '$lib/stoneStore';
  import { get } from 'svelte/store';

  /* =====================
   * 1) 돌 정보 & 성장 로직
   * ===================== */
  const growthFactor = 1.0; // k 값
  const stoneTypes = [
    'andesite',
    'basalt',
    'conglomerate',
    'gneiss',
    'granite',
    'limestone',
    'quartzite',
    'sandstone',
    'shale',
    'tuff'
  ];

  let computedSize = 1;
  let countdown = 10; // 다음 돌 뽑기까지 남은 시간(초)

  function formatSize(num: number) {
    return num.toFixed(2);
  }

  function randomizeStone() {
    const randomType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
    currentStone.update(stone => ({
      ...stone,
      type: randomType,
      baseSize: 1,
      totalElapsed: 0,
      name: randomType
    }));
  }

  // h1을 더블클릭하면 호출되어 돌 이름을 수정
  function editStoneName() {
    const stone = get(currentStone);
    const newName = prompt('돌의 이름을 변경하세요:', stone.name);
    if (newName && newName.trim() !== '') {
      currentStone.set({ ...stone, name: newName });
    }
  }

  /* =====================
   * 2) 메뉴 (배경 클릭)
   * ===================== */
  let showMenu = false;

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function handleBackgroundKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMenu();
    }
  }

  /* =====================
   * 3) 로그인 사용자의 저장된 돌 불러오기
   * ===================== */
  async function loadUserStone() {
    if (localStorage.getItem('skipLoadUserStone')) {
      localStorage.removeItem('skipLoadUserStone');
      return;
    }
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (sessionData?.session?.user) {
      const userId = sessionData.session.user.id;
      const { data: stoneData, error: stoneError } = await supabase
        .from('stones')
        .select('*')
        .eq('user_id', userId)
        .order('discovered_at', { ascending: false })
        .limit(1);
      if (stoneError) {
        console.error("저장된 돌 불러오기 실패:", stoneError);
      } else if (stoneData && stoneData.length > 0) {
        const stoneRecord = stoneData[0];
        const loadedStone = {
          id: stoneRecord.id,
          type: stoneRecord.type,
          baseSize: stoneRecord.size,
          totalElapsed: stoneRecord.totalElapsed || 0,
          name: stoneRecord.name
        };
        currentStone.set(loadedStone);
        computedSize = loadedStone.baseSize;
      }
    }
  }

  /* =====================
   * 4) onMount - 돌 성장 로직 (증분 업데이트 방식)
   * ===================== */
  async function autoUpdateStone() {
    const stone = get(currentStone);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 가져오기 실패:", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const userId = sessionData.session.user.id;
    const { error } = await supabase.from('stones').upsert({
      id: stone.id,
      type: stone.type,
      size: stone.baseSize,
      totalElapsed: stone.totalElapsed || 0,
      name: stone.name,
      discovered_at: new Date().toISOString(),
      user_id: userId
    });
    if (error) {
      console.error("자동 저장 실패:", error);
    }
  }

  onMount(() => {
    loadUserStone();
    const growthTimer = setInterval(async () => {
      currentStone.update(stone => {
        const oldElapsed = stone.totalElapsed || 0;
        const deltaX = growthFactor * Math.log((oldElapsed + 2) / (oldElapsed + 1));
        // 0.8 ~ 1.2 사이의 랜덤 변동 추가
        const randomFactor = 0.4 * Math.random() + 0.8;
        const newSize = stone.baseSize + deltaX * randomFactor;
        computedSize = newSize;
        return { ...stone, baseSize: newSize, totalElapsed: oldElapsed + 1 };
      });
      await autoUpdateStone();
    }, 1000);

    // 10초마다 자동으로 돌 뽑기 & 남은 시간 표시
    const countdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        drawStone();
        countdown = 10;
      }
    }, 1000);

    return () => {
      clearInterval(growthTimer);
      clearInterval(countdownTimer);
    };
  });

  function logoutHandler() {
    supabase.auth.signOut();
  }

  async function saveStone() {
    // 더 이상 사용하지 않을 저장 기능
  }

  async function drawStone() {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return;
    }
    const randomType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
    const newStone = {
      id: crypto.randomUUID(),
      type: randomType,
      size: 1,
      name: randomType,
      discovered_at: new Date().toISOString(),
      user_id: sessionData.session.user.id,
      totalElapsed: 0
    };
    const { data, error } = await supabase.from('stones').insert(newStone).select();
    if (error) {
      console.error("돌 뽑기 실패:", error);
    } else {
      console.log("돌 뽑기 성공:", data);
    }
  }
</script>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
  }
  .background-div {
    position: relative;
    width: 100%;
    min-height: 100vh;
    background-color: #f5f5f5;
    cursor: pointer;
    outline: none;
  }
  .background-div:focus {
    outline: 2px solid #aaa;
  }
  .stone-info {
    max-width: 600px;
    margin: 0 auto;
    text-align: center;
    padding: 2rem 1rem;
  }
  .stone-image-wrapper {
    display: flex;
    justify-content: center;
  }
  .stone-img {
    width: 200px;
    height: auto;
    transition: transform 0.3s ease-in-out;
  }
  .stone-text {
    margin-top: 1rem;
  }
  p {
    margin: 0.5rem 0;
  }
  .btn {
    margin: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .menu-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    padding: 1rem;
    animation: fadeDown 0.3s ease forwards;
    z-index: 9;
  }
  @keyframes fadeDown {
    0% {
      opacity: 0;
      transform: translateY(-20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .stone-name {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font-size: 2rem; /* 원하는 크기로 조정 */
    font-weight: bold;
    text-align: center;
    cursor: pointer;
  }
</style>

<div
  class="background-div"
  role="button"
  aria-label="Toggle menu"
  tabindex="0"
  on:click={toggleMenu}
  on:keydown={handleBackgroundKeydown}>
  <div class="stone-info" role="presentation">
    <div class="stone-image-wrapper">
      <img
        class="stone-img"
        src={`/assets/img/common/${$currentStone.type}.png`}
        alt="Stone"
        style="transform: scale({1 + (computedSize - 1) * 0.1});" />
    </div>
    <div class="stone-text">
      <!-- 모든 플랫폼에서 더블클릭 이벤트 사용 -->
      <button
        class="stone-name"
        type="button"
        on:click|stopPropagation
        on:dblclick|stopPropagation={editStoneName}
        on:keydown|stopPropagation={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            editStoneName();
          }
        }}>
        {$currentStone.name}
      </button>
      <p>Current size: {formatSize(computedSize)}</p>
      <p>Current stone type: {$currentStone.type}</p>
      <p>총 성장 시간: {$currentStone.totalElapsed || 0}초</p>
      <button class="btn" type="button" on:click|stopPropagation={drawStone}>
        돌 뽑기
      </button>
      <p>다음 돌 획득까지: {countdown}초</p>
    </div>
  </div>
  {#if showMenu}
    <div
      class="menu-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Menu">
      <button class="btn" on:click={() => goto('/storage')}>보관함</button>
      <button class="btn">도움말</button>
      <button class="btn">설정</button>
      <button class="btn">마켓</button>
      <button class="btn" on:click={logoutHandler}>로그아웃</button>
    </div>
  {/if}
</div>