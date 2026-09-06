/** Sample-domain noise gate. No arrays, closures, or promises in process(). */
class SignalGate extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'threshold',defaultValue:.0005,minValue:0,maxValue:1,automationRate:'k-rate'},{name:'enabled',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}];}
  constructor(){super();this.envelope=0;this.gain=1;this.attack=Math.exp(-1/(sampleRate*.003));this.release=Math.exp(-1/(sampleRate*.1));}
  process(inputs,outputs,params){const input=inputs[0],output=outputs[0];if(!input?.length)return true;const threshold=params.threshold[0],enabled=params.enabled[0]>.5;
    for(let i=0;i<output[0].length;i++){let peak=0;for(let c=0;c<input.length;c++)peak=Math.max(peak,Math.abs(input[c][i]||0));const a=peak>this.envelope?this.attack:this.release;this.envelope=a*this.envelope+(1-a)*peak;const target=!enabled||this.envelope>=threshold?1:0;const g=target>this.gain?this.attack:this.release;this.gain=g*this.gain+(1-g)*target;for(let c=0;c<output.length;c++)output[c][i]=(input[Math.min(c,input.length-1)][i]||0)*this.gain;}
    return true;
  }
}
registerProcessor('signalforge-gate',SignalGate);
