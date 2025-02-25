<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { currentStone } from '$lib/stoneStore';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { updateUserXp } from '$lib/xpUtils';

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

  // 돌 이름 수정 함수 (번역 적용)
  function editStoneName() {
    const stone = get(currentStone);
    const translate = get(t);
    const newName = prompt(translate('changeStoneNamePrompt'), stone.name);
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
  let stonesSubscription: RealtimeChannel;

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
      // xp 업데이트 (매 초마다 1xp 증가 및 레벨 체크)
      updateUserXp();

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

    // 현재 로그인 사용자의 ID 등을 사용해 구독 범위를 제한할 수도 있음.
    // 예를 들어, userId 필드를 조건으로 걸어 줄 수 있습니다.
    const stoneId = get(currentStone).id;

    // Supabase v2의 realtime 채널 API 사용
    stonesSubscription = supabase
      .channel('stone-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stones',
          filter: `id=eq.${stoneId}`
        },
        (payload: any) => {
          console.log('실시간 돌 업데이트:', payload);
          const updatedStone = payload.new;
          if (updatedStone.id === stoneId) {
            currentStone.set({
              id: updatedStone.id,
              type: updatedStone.type,
              baseSize: updatedStone.size,
              totalElapsed: updatedStone.totalElapsed || 0,
              name: updatedStone.name
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(stonesSubscription);
    };
  });

  async function logoutHandler() {
    // 현재 세션 확인
    const sessionResponse = await supabase.auth.getSession();
    if (!sessionResponse.data.session) {
      console.log("현재 활성화된 세션이 없습니다. 이미 로그아웃 상태입니다.");
      goto('/login'); // 이미 로그아웃된 경우 로그인 화면으로 이동
      return;
    }
    
    // 세션이 존재할 경우 로그아웃 요청 실행
    const { error } = await supabase.auth.signOut();
    if (error) {
      // 만약 "Auth session missing!" 오류가 발생하면 이미 로그아웃된 것으로 간주
      if (error.message === "Auth session missing!") {
        console.log("세션이 이미 만료되었거나 존재하지 않습니다. 로그인 페이지로 이동합니다.");
        goto('/login');
        return;
      }
      console.error("로그아웃 실패:", error.message);
    } else {
      console.log("로그아웃 성공");
      goto('/login'); // 로그아웃 성공 시 로그인 페이지로 이동
    }
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

  let copyMessage: string = '';

  function handleShare(): void {
    navigator.clipboard.writeText(window.location.href)
      .then(() => {
        copyMessage = $t('linkCopied'); // 다국어 번역에 등록된 메시지 사용
        setTimeout(() => {
          copyMessage = "";
        }, 3000);
      })
      .catch((err) => console.error("Failed to copy link:", err));
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
    margin-top: 10vh;
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
    padding: 0.5rem 1rem;
    color: #000;
    background-color: #B7DDBF;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    margin: 0.5rem;
  }
  .btn:hover {
    background-color: #A3CBB1;
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
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .menu-group.help-group {
    order: 1;
    gap: 0.25rem;
  }
  .menu-group.storage-group {
    order: 2;
  }
  .menu-group {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
  }
  @media (min-width: 600px) {
    .menu-overlay {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
    .menu-group.storage-group {
      order: 1;
    }
    .menu-group.help-group {
      order: 2;
    }
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
  .btn.logout-btn {
    background-color: #F88A87;
  }
  .btn.logout-btn:hover {
    background-color: #E27675;
  }

  /* 아이콘 버튼 관련 스타일 */
  .icon-btn {
    padding: 0.25rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #fff !important;
  }
  
  .icon-btn img {
    display: block;
    width: 20px;  /* 버튼 크기에 맞게 조정 (필요시 수정) */
    height: 20px;
  }

  /* 설정/도움말 버튼의 테두리 제거 */
  .btn.icon-btn {
    border: none !important;
  }

  /* help-group 내의 버튼 간격 줄이기 */
  .menu-group.help-group .btn {
    margin: 0.1rem; /* 각 버튼의 외부 여백도 줄임 */
  }

  /* 보관함/마켓 (아이콘 텍스트 버튼) 스타일 수정 */
  .icon-text-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 60px;           /* 정사각형 버튼 너비 */
    height: 60px;          /* 정사각형 버튼 높이 */
    background-color: #fff;
    margin: 0.1rem;
    border: 1px solid #CCC;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
    box-sizing: border-box;
  }
  
  .icon-text-btn:hover {
    background-color: #f7f7f7;
  }
  
  .icon-text-btn img {
    display: block;
    width: 34px;           /* 아이콘 이미지 크기 확대 */
    height: 34px;
  }
  
  .btn-label {
    font-size: 0.8rem;
    margin-top: 0.25rem;
    color: #000;
  }

  /* 보관함/마켓 버튼의 패딩을 줄여서 내부 여백을 축소 */
  .btn.icon-text-btn {
    padding: 0.1rem !important;
  }

  .copy-message {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    z-index: 1000;
    font-size: 0.9rem;
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
      <p>{$t('sizeLabel')}: {formatSize(computedSize)}</p>
      <p>{$t('typeLabel')}: {$t('stoneTypes.' + $currentStone.type)}</p>
      <p>{$t('totalGrowthTimeLabel')}: {$currentStone.totalElapsed || 0}s</p>
      <p>{$t('nextStoneInLabel')}: {formatTime(countdown)}</p>
    </div>
  </div>
  {#if showMenu}
    <div class="menu-overlay" role="dialog" aria-modal="true" aria-label="Menu">
      <div class="menu-group storage-group">
        <button class="btn icon-text-btn" on:click={() => goto('/storage')}>
          <img src="/assets/icons/storage.png" alt="{$t('storage')}" />
          <span class="btn-label">{$t('storage')}</span>
        </button>
        <button class="btn icon-text-btn" on:click={() => goto('/profile')}>
          <img src="/assets/icons/profile.png" alt="{$t('profile')}" />
          <span class="btn-label">{$t('profile')}</span>
        </button>
        <button class="btn icon-text-btn" on:click={() => goto('/catalog')}>
          <img src="/assets/icons/catalog.png" alt="{$t('catalog')}" />
          <span class="btn-label">{$t('catalog')}</span>
        </button>
        <button class="btn icon-text-btn" on:click={() => goto('/market')}>
          <img src="/assets/icons/market.png" alt="{$t('market')}" />
          <span class="btn-label">{$t('market')}</span>
        </button>
      </div>
      <div class="menu-group help-group">
        <button class="btn icon-btn" title="{$t('share')}" aria-label="{$t('share')}" on:click={handleShare}>
          <img src="/assets/icons/share.png" alt="{$t('share')}" />
        </button>
        <button class="btn icon-btn" on:click={() => goto('/help')} title="{$t('help')}" aria-label="{$t('help')}">
          <img src="/assets/icons/help.png" alt="{$t('help')}" />
        </button>
        <button class="btn icon-btn" on:click={() => goto('/settings')} title="{$t('settings')}" aria-label="{$t('settings')}">
          <img src="/assets/icons/settings.png" alt="{$t('settings')}" />
        </button>
        <button class="btn logout-btn" on:click={logoutHandler}>{$t('logout')}</button>
      </div>
    </div>
  {/if}
</div>

{#if copyMessage}
  <div class="copy-message">{copyMessage}</div>
{/if}