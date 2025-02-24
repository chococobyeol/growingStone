<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { goto } from '$app/navigation';
  import { currentStone } from '$lib/stoneStore';
  import { get } from 'svelte/store';
  import { t } from 'svelte-i18n';
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { showDeleteWarning } from '$lib/settingsStore';

  // DB에 저장된 돌 데이터 타입 (DB의 size는 현재 돌의 baseSize에 해당)
  type Stone = {
    id: string;
    type: string;
    size: number;
    discovered_at: string;
    name: string;
    totalElapsed?: number;
  };

  let storedStones: Stone[] = [];
  let errorMsg = '';
  let stonesSubscription: RealtimeChannel;

  async function loadStoredStones() {
    const { data, error } = await supabase
      .from('stones')
      .select('*')
      .order('discovered_at', { ascending: false });
    if (error) {
      errorMsg = error.message;
    } else {
      storedStones = data;
      // 현재 돌을 최상단에 배치합니다.
      const current = get(currentStone);
      storedStones.sort((a, b) => {
        if (a.id === current.id) return -1;
        if (b.id === current.id) return 1;
        return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime();
      });
    }
  }

  // 불러오기(스왑) 버튼 클릭 시, 현재 돌과 저장된 돌을 서로 교환합니다.
  async function swapStone(stone: Stone) {
    try {
      const current = get(currentStone);
      const updateForCurrent = {
        type: stone.type,
        size: stone.size,
        name: stone.name,
        totalElapsed: stone.totalElapsed || 0,
        discovered_at: new Date().toISOString()
      };
      const updateForStored = {
        type: current.type,
        size: current.baseSize,
        name: current.name,
        totalElapsed: current.totalElapsed || 0,
        discovered_at: new Date().toISOString()
      };

      // 현재 돌 업데이트
      const { error: errorCurrent } = await supabase
        .from('stones')
        .update(updateForCurrent)
        .eq('id', current.id);
      if (errorCurrent) {
        throw new Error(errorCurrent.message);
      }

      // 선택한 돌 업데이트
      const { error: errorStored } = await supabase
        .from('stones')
        .update(updateForStored)
        .eq('id', stone.id);
      if (errorStored) {
        // 여기서 롤백하는 로직을 추가할 수 있음 (예: 다시 current 돌을 원래대로 복구)
        throw new Error(errorStored.message);
      }

      // 클라이언트 상태 업데이트
      currentStone.set({
        id: stone.id,
        type: stone.type,
        baseSize: stone.size,
        totalElapsed: stone.totalElapsed || 0,
        name: stone.name
      });
      await loadStoredStones();
      goto('/');
    } catch (error) {
      errorMsg = (error as Error).message;
      // 추가: 사용자에게 에러 메시지를 표시하고, 필요시 상태 롤백 처리를 구현
    }
  }

  async function deleteStone(stone: Stone) {
    const translate = get(t);
    // 삭제 경고 설정이 true일 경우에만 확인 대화상자를 표시합니다.
    if (get(showDeleteWarning)) {
      if (!confirm(translate('deleteStoneConfirm'))) return;
    }
    try {
      const { error } = await supabase
        .from('stones')
        .delete()
        .eq('id', stone.id);
      if (error) {
        throw new Error(error.message);
      }
      await loadStoredStones();
    } catch (error) {
      errorMsg = (error as Error).message;
      // 에러 발생 시 사용자에게 알림
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      goto('/');
    }
  }

  onMount(() => {
    loadStoredStones();
    window.addEventListener('keydown', handleKeydown);

    // 실시간 구독: stones 테이블에서 INSERT, UPDATE, DELETE 이벤트 감지
    stonesSubscription = supabase
      .channel('stones-storage')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stones' },
        (payload: any) => {
          console.log('Stone INSERT 이벤트:', payload);
          loadStoredStones();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stones' },
        (payload: any) => {
          console.log('Stone UPDATE 이벤트:', payload);
          loadStoredStones();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'stones' },
        (payload: any) => {
          console.log('Stone DELETE 이벤트:', payload);
          loadStoredStones();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      supabase.removeChannel(stonesSubscription);
    };
  });
</script>

<div>
  <h1>{$t('storage')}</h1>
  {#if errorMsg}
    <p style="color: red;">{errorMsg}</p>
  {/if}
  {#if storedStones.length === 0}
    <p>{$t('noStoredStones')}</p>
  {:else}
    <ul>
      {#each storedStones as stone}
        <li>
          <div class="stone-item">
            <img
              class="stone-img"
              src={`/assets/img/common/${stone.type}.png`}
              alt={$t(`stoneTypes.${stone.type}`)}
            />
            <div class="stone-details">
              <strong>{stone.name}</strong> ({$t(`stoneTypes.${stone.type}`)}) - {$t('sizeLabel')}: {stone.size.toFixed(4)} ({$t('totalGrowthTimeLabel')}: {stone.totalElapsed || 0}s)
              <small>({$t('savedAt')}: {new Date(stone.discovered_at).toLocaleString()})</small>
              {#if stone.id === $currentStone.id}
                <span style="color: green; font-weight: bold;"> {$t('currentStoneTag')} </span>
              {/if}
            </div>
          </div>
          <div class="stone-actions">
            {#if stone.id !== $currentStone.id}
              <button class="swap" on:click={() => swapStone(stone)}>{$t('loadButton')}</button>
              <button class="delete" on:click={() => deleteStone(stone)}>{$t('throwAwayButton')}</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- 뒤로 버튼을 고정 -->
<button class="back-btn" on:click={() => goto('/')}>{$t('backButton')}</button>

<style>
  h1 {
    text-align: center;
    margin-bottom: 1rem;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .stone-item {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .stone-img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 50%;
  }
  .stone-details {
    display: flex;
    flex-direction: column;
  }
  .stone-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-left: auto;
  }
  /* 모든 버튼에 검은 글자 대신 설정된 색상과, 테두리를 #DDDDDD로 적용 */
  .stone-actions button {
    padding: 0.5rem 1rem;
    color: #000;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  /* 불러오기 버튼: #B7DDBF, 호버 시 #A3CBB1 */
  .stone-actions button.swap {
    background-color: #B7DDBF;
  }
  .stone-actions button.swap:hover {
    background-color: #A3CBB1;
  }
  /* 버리기 버튼: #F88A87, 호버 시 #E27675 */
  .stone-actions button.delete {
    background-color: #F88A87;
  }
  .stone-actions button.delete:hover {
    background-color: #E27675;
  }
  @media (max-width: 600px) {
    li {
      flex-direction: column;
      align-items: stretch;
      text-align: left;
    }
    .stone-actions {
      width: 100%;
      margin-top: 0.5rem;
      justify-content: center;
    }
    .stone-actions button {
      flex: 1;
    }
  }
  /* 뒤로 버튼: 배경 #D7D4CD, 글자색 및 테두리 #DDDDDD 적용 */
  .back-btn {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #D7D4CD;
    color: #000;
    padding: 0.5rem 1rem;
    border: 1px solid #DDDDDD;
    border-radius: 4px;
    z-index: 1000;
    margin: 0;
    cursor: pointer;
  }
</style>
