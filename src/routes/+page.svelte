<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  /* =====================
   * 1) 돌 정보 & 성장 로직
   * ===================== */
  let stone = {
    type: 'andesite',
    size: 1,
    startTime: 0
  };

  const growthFactor = 1.0;
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

  // 숫자 포맷
  function formatSize(num: number) {
    return num.toFixed(2);
  }

  // 돌 종류 랜덤 변경
  function randomizeStone() {
    stone.type = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
    stone.size = 1;
    stone.startTime = Date.now();
  }

  /* =====================
   * 2) 메뉴 (배경 클릭)
   * ===================== */
  let showMenu = false;

  // 배경 클릭 or Enter/Space => 메뉴 열기/닫기
  function toggleMenu() {
    showMenu = !showMenu;
  }

  // 키보드 이벤트 처리 (Enter/Space)
  function handleBackgroundKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); // 스크롤 등 방지
      toggleMenu();
    }
  }

  /* =====================
   * 3) onMount
   * ===================== */
  onMount(() => {
    // 돌 성장 타이머
    stone.startTime = Date.now();
    const timer = setInterval(() => {
      const elapsedTime = (Date.now() - stone.startTime) / 1000;
      stone.size = 1 + growthFactor * Math.log(1 + elapsedTime);
    }, 1000);

    return () => clearInterval(timer);
  });

  function logoutHandler() {
    supabase.auth.signOut();
  }
</script>

<!-- =====================
     4) 스타일
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
    height: 100vh;
    background-color: #f5f5f5;
    cursor: pointer;
    outline: none;
  }
  .background-div:focus {
    outline: 2px solid #aaa;
  }

  /* 돌 정보 영역 */
  .stone-info {
    margin-top: 0;  /* 상단 여백 제거 */
    text-align: center;
  }

  .stone-img {
    width: 200px;
    height: auto;
    display: block;
    margin: 1rem auto;
  }

  /* 기본 텍스트 요소의 여백도 최소화 */
  h1, p {
    margin: 0;
    padding: 0;
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
     5) 구조
     ===================== -->
<div
  class="background-div"
  role="button"
  aria-label="Toggle menu"
  tabindex="0"
  on:click={toggleMenu}
  on:keydown={handleBackgroundKeydown}>
  <!-- 돌 정보 영역 (컨테이너는 이벤트 전파를 막지 않음) -->
  <div class="stone-info" role="presentation">
    <h1>Growing Stone</h1>
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <img
      class="stone-img"
      src={`/assets/img/common/${stone.type}.png`}
      alt="Stone"
      on:click|stopPropagation />
    <p>Current size: {formatSize(stone.size)}</p>
    <p>Current stone type: {stone.type}</p>
    <!-- 버튼에도 stopPropagation 적용 -->
    <button class="btn" on:click|stopPropagation={randomizeStone}>
      Randomize Stone
    </button>
  </div>

  <!-- 메뉴 표시 -->
  {#if showMenu}
    <div
      class="menu-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Menu">
      <button class="btn">보관함</button>
      <button class="btn">도움말</button>
      <button class="btn">설정</button>
      <button class="btn">마켓</button>
      <button class="btn" on:click={logoutHandler}>로그아웃</button>
    </div>
  {/if}
</div>