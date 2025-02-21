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

  // computedSize는 돌의 현재 크기 (초기값 1, 성장하면서 값 증가)
  let computedSize = 1;

  // 숫자 포맷 함수
  function formatSize(num: number) {
    return num.toFixed(2);
  }

  // 돌 종류를 변경할 때, 그리고 새 돌일 때 기본값 및 성장시간을 초기화
  function randomizeStone() {
    currentStone.update(stone => ({
      ...stone,
      type: stoneTypes[Math.floor(Math.random() * stoneTypes.length)],
      baseSize: 1,
      totalElapsed: 0
    }));
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
    // 스왑 이후라면 DB 로드를 건너뛰기 위해 플래그 확인
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
      // 최신 저장된 돌을 한 건 불러옵니다 (저장일 기준 내림차순)
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
    // 현재 세션의 사용자 정보를 가져옵니다.
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
    
    // user_id 필드를 추가하여 upsert합니다.
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
    loadUserStone(); // 로그인한 사용자의 저장된 돌 상태 불러오기

    const timer = setInterval(async () => {
      currentStone.update(stone => {
        const oldElapsed = stone.totalElapsed || 0;
        // 성장 증가량 계산: deltaX = k * log((t_tot + 2) / (t_tot + 1))
        const deltaX = growthFactor * Math.log((oldElapsed + 2) / (oldElapsed + 1));
        const newSize = stone.baseSize + deltaX;
        computedSize = newSize;
        return { ...stone, baseSize: newSize, totalElapsed: oldElapsed + 1 };
      });
      await autoUpdateStone();
    }, 1000);
    return () => clearInterval(timer);
  });

  function logoutHandler() {
    supabase.auth.signOut();
  }

  // 저장 시, 현재 돌 사이즈(누적된 baseSize)와 총 성장 시간을 저장합니다.
  async function saveStone() {
    // 더 이상 사용하지 않을 저장 기능
  }

  // 돌 뽑기 버튼 클릭 시, 현재 돌은 그대로 두고 보관함에 새 돌(랜덤 타입, 사이즈 1)을 추가합니다.
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
    const newStone = {
      id: crypto.randomUUID(),
      type: stoneTypes[Math.floor(Math.random() * stoneTypes.length)],
      size: 1, // DB에서는 baseSize에 해당하는 값
      name: '새 돌',
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

<!-- =====================
     5) 스타일
     ===================== -->
<style>
  /* 전역 스타일은 :global(...)로 감싸서 Unused CSS selector 경고 해결 */
  :global(html, body) {
    margin: 0;
    padding: 0;
  }

  /* 배경 영역 - div에 role=button으로 접근성 처리 */
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

  /* 돌 정보 영역 */
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

  /* 기본 텍스트 요소의 여백도 최소화 */
  h1, p {
    margin: 0.5rem 0;
  }

  .btn {
    margin: 0.5rem;
    padding: 0.5rem 1rem;
  }

  /* 메뉴 본체 */
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
</style>
<!-- =====================
     6) 구조
     ===================== -->
<div
  class="background-div"
  role="button"
  aria-label="Toggle menu"
  tabindex="0"
  on:click={toggleMenu}
  on:keydown={handleBackgroundKeydown}>
  <!-- 돌 정보 영역 -->
  <div class="stone-info" role="presentation">
    <!-- 돌 이미지는 절대 위치로 배치되어 뒤쪽에 표시됩니다 -->
    <div class="stone-image-wrapper">
      <img
        class="stone-img"
        src={`/assets/img/common/${$currentStone.type}.png`}
        alt="Stone"
        style="transform: scale({1 + (computedSize - 1) * 0.1});" />
    </div>
    <!-- 텍스트는 이미지를 덮어서 앞쪽에 표시 -->
    <div class="stone-text">
      <h1>Growing Stone</h1>
      <p>Current size: {formatSize(computedSize)}</p>
      <p>Current stone type: {$currentStone.type}</p>
      <p>총 성장 시간: {$currentStone.totalElapsed || 0}초</p>
      <button class="btn" type="button" on:click|stopPropagation={drawStone}>
        돌 뽑기
      </button>
    </div>
  </div>

  <!-- 메뉴 표시 (저장 버튼 제거) -->
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
