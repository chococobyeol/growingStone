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
  // countdown은 DB에 저장된 remaining_time 값을 사용 (초 단위)
  let countdown = 0;

  function formatSize(num: number) {
    return num.toFixed(4);
  }

  // 초 단위의 시간을 "HH:MM:SS" 형식으로 변환하는 함수 (예: 01:23:45)
  function formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

  // 돌 이름 수정 함수
  function editStoneName() {
    const stone = get(currentStone);
    const newName = prompt('Change the name of the stone:', stone.name);
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
      } else {
        // 저장된 돌이 없으면 drawStone을 호출하여 새 돌을 뽑고 currentStone에 설정하도록 처리
        await drawStoneAndSetCurrent();
      }
    }
  }

  async function drawStoneAndSetCurrent() {
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
    } else if (data && data.length > 0) {
      const createdStone = data[0];
      currentStone.set({
        id: createdStone.id,
        type: createdStone.type,
        baseSize: createdStone.size,
        totalElapsed: createdStone.totalElapsed || 0,
        name: createdStone.name
      });
      computedSize = createdStone.size;
    }
  }

  /* =====================
   * 4) 돌 성장 및 자동 저장 로직
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

  /* =====================
   * 5) 타이머 관련 DB 연동 함수 (프로필 테이블의 remaining_time 사용)
   * ===================== */
  async function loadRemainingTime(): Promise<number | null> {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패:", sessionError);
      return null;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다.");
      return null;
    }
    const userId = sessionData.session.user.id;
    const { data, error } = await supabase
      .from('profiles')
      .select('remaining_time')
      .eq('id', userId)
      .single();
    if (error) {
      console.error("남은 시간 불러오기 실패:", error);
      return null;
    }
    return data.remaining_time;
  }

  async function updateRemainingTime(newTime: number) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("세션 로드 실패 (update remaining time):", sessionError);
      return;
    }
    if (!sessionData?.session?.user) {
      console.error("로그인된 사용자가 없습니다. (update remaining time)");
      return;
    }
    const userId = sessionData.session.user.id;
    const { error } = await supabase
      .from('profiles')
      .update({ remaining_time: newTime })
      .eq('id', userId);
    if (error) {
      console.error("남은 시간 업데이트 실패:", error);
    }
  }

  /* =====================
   * 6) onMount - 돌 성장 및 타이머 로직 (페이지 활성상태일 때만 시간 진행)
   * ===================== */
  onMount(() => {
    loadUserStone();

    // DB에서 남은 시간을 로드. 값이 없거나 0 이하이면 3600초(1시간)로 초기화.
    (async () => {
      const dbRemaining = await loadRemainingTime();
      if (dbRemaining === null || dbRemaining <= 0) {
        countdown = 3600;
        updateRemainingTime(3600);
      } else {
        countdown = dbRemaining;
      }
    })();

    // 1초마다 돌을 성장시키고, 남은 시간을 1초씩 감소시킵니다.
    const timer = setInterval(() => {
      // 돌 성장 업데이트
      currentStone.update(stone => {
        const oldElapsed = stone.totalElapsed || 0;
        const deltaX = growthFactor * Math.log((oldElapsed + 2) / (oldElapsed + 1));
        const randomFactor = 0.4 * Math.random() + 0.8;
        const newSize = stone.baseSize + deltaX * randomFactor;
        computedSize = newSize;
        return { ...stone, baseSize: newSize, totalElapsed: oldElapsed + 1 };
      });
      autoUpdateStone();

      // 남은 시간 1초 감소 (돌을 성장시키는 동안에만 시간 감소)
      if (countdown > 0) {
        countdown--;
        updateRemainingTime(countdown);
        if (countdown <= 0) {
          // 남은 시간이 0이 되면 돌 뽑기 실행 후 3600초(1시간)로 리셋
          drawStone().then(() => {
            countdown = 3600;
            updateRemainingTime(3600);
          });
        }
      }
    }, 1000);

    return () => {
      clearInterval(timer);
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
    position: relative;
    z-index: 0;
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
    position: relative;
    z-index: 1;
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
      <p>Size: {formatSize(computedSize)}</p>
      <p>Type: {$currentStone.type}</p>
      <p>Total Growth Time: {$currentStone.totalElapsed || 0}s</p>
      <p>Next stone in: {formatTime(countdown)}</p>
    </div>
  </div>
  {#if showMenu}
    <div
      class="menu-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Menu">
      <button class="btn" on:click={() => goto('/storage')}>Storage</button>
      <button class="btn">Help</button>
      <button class="btn">Settings</button>
      <button class="btn">Market</button>
      <button class="btn" on:click={logoutHandler}>Logout</button>
    </div>
  {/if}
</div>