// Native messenger scroll behavior: preserve the reader's location during polling.
export function isChatAtBottom({scrollTop=0,scrollHeight=0,clientHeight=0},threshold=48){
 return scrollHeight-clientHeight-scrollTop<=threshold;
}
export function restoredChatPosition(before,after,{stickToBottom=false}={}){
 if(stickToBottom)return Math.max(0,after.scrollHeight-after.clientHeight);
 return Math.max(0,Math.min(after.scrollHeight-after.clientHeight,
  before.scrollTop));
}
export function shouldShowJump({scrollTop=0,scrollHeight=0,clientHeight=0},hasNew=false){
 return hasNew&&!isChatAtBottom({scrollTop,scrollHeight,clientHeight});
}
