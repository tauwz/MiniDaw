import { MidiCurve, MidiLogEntry, MidiMapping, MidiPortInfo } from '../types/synth';

type LogListener = (entry: MidiLogEntry) => void;
type PortsListener = (inputs: MidiPortInfo[], outputs: MidiPortInfo[], supported: boolean) => void;
type LearnCallback = (channel: number, ccOrNote: number, isNote: boolean) => void;

class MidiRouterEngine {
  private midiAccess: MIDIAccess | null = null;
  private selectedOutputId = 'virtual-internal';
  private inputs: MidiPortInfo[] = [];
  private outputs: MidiPortInfo[] = [];
  private supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  private logListeners: Set<LogListener> = new Set();
  private portsListeners: Set<PortsListener> = new Set();
  private learnCallback: LearnCallback | null = null;
  private seqCounter = 0;

  public async init(): Promise<void> {
    if (!this.supported) {
      this.notifyPorts();
      return;
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this.midiAccess = access;
      this.refreshPorts();
      access.onstatechange = () => this.refreshPorts();
    } catch {
      this.supported = false;
      this.notifyPorts();
    }
  }

  private refreshPorts() {
    if (!this.midiAccess) return;

    const nextInputs: MidiPortInfo[] = [];
    const nextOutputs: MidiPortInfo[] = [];

    this.midiAccess.inputs.forEach((input) => {
      nextInputs.push({
        id: input.id,
        name: input.name || 'MIDI Input',
        manufacturer: input.manufacturer || 'Generic',
        type: 'input',
        state: input.state,
      });
      input.onmidimessage = (event) => this.handleIncomingMidi(input.name || 'MIDI In', event);
    });

    this.midiAccess.outputs.forEach((output) => {
      nextOutputs.push({
        id: output.id,
        name: output.name || 'MIDI Output',
        manufacturer: output.manufacturer || 'Generic',
        type: 'output',
        state: output.state,
      });
    });

    this.inputs = nextInputs;
    this.outputs = nextOutputs;
    this.notifyPorts();
  }

  public getPorts(): { inputs: MidiPortInfo[]; outputs: MidiPortInfo[]; supported: boolean } {
    return {
      inputs: this.inputs,
      outputs: this.outputs,
      supported: this.supported,
    };
  }

  public getSelectedOutputId(): string {
    return this.selectedOutputId;
  }

  public setSelectedOutputId(id: string) {
    this.selectedOutputId = id;
  }

  public subscribeLogs(fn: LogListener): () => void {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }

  public subscribePorts(fn: PortsListener): () => void {
    this.portsListeners.add(fn);
    fn(this.inputs, this.outputs, this.supported);
    return () => this.portsListeners.delete(fn);
  }

  public startMidiLearn(cb: LearnCallback) {
    this.learnCallback = cb;
  }

  public cancelMidiLearn() {
    this.learnCallback = null;
  }

  private notifyPorts() {
    this.portsListeners.forEach((fn) => fn(this.inputs, this.outputs, this.supported));
  }

  private emitLog(entry: Omit<MidiLogEntry, 'id' | 'timestamp'>) {
    this.seqCounter += 1;
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    const fullEntry: MidiLogEntry = {
      ...entry,
      id: `midi-${this.seqCounter}`,
      timestamp: ts,
    };
    this.logListeners.forEach((fn) => fn(fullEntry));
  }

  public applyCurve(normalized: number, curve: MidiCurve): number {
    const x = Math.max(0, Math.min(1, normalized));
    switch (curve) {
      case 'exponential':
        return x * x;
      case 'logarithmic':
        return Math.sqrt(x);
      case 'linear':
      default:
        return x;
    }
  }

  public scaleMidiValue(normalized: number, mapping: MidiMapping): number {
    const curved = this.applyCurve(normalized, mapping.curve);
    const min = Math.max(0, Math.min(127, mapping.minValue));
    const max = Math.max(0, Math.min(127, mapping.maxValue));
    return Math.round(min + curved * (max - min));
  }

  private getActiveOutputPort(): MIDIOutput | null {
    if (!this.midiAccess || this.selectedOutputId === 'virtual-internal') return null;
    return this.midiAccess.outputs.get(this.selectedOutputId) || null;
  }

  private getPortDisplayName(): string {
    const port = this.getActiveOutputPort();
    return port?.name || 'Internal PatchGrid Bus';
  }

  public sendMappedControl(label: string, mapping: MidiMapping, normalized: number) {
    if (!mapping.enabled) return;
    const ch = Math.max(1, Math.min(16, mapping.channel));
    const chByte = ch - 1;
    const outPort = this.getActiveOutputPort();
    const portName = this.getPortDisplayName();

    if (mapping.messageType === 'cc') {
      const cc = Math.max(0, Math.min(127, mapping.ccNumber));
      const val = this.scaleMidiValue(normalized, mapping);
      const status = 0xb0 | chByte;
      outPort?.send([status, cc, val]);
      this.emitLog({
        direction: 'out',
        portName,
        channel: ch,
        type: 'CC',
        label,
        data1: cc,
        data2: val,
        rawHex: `${status.toString(16).toUpperCase()} ${cc.toString(16).padStart(2, '0').toUpperCase()} ${val.toString(16).padStart(2, '0').toUpperCase()}`,
      });
    } else if (mapping.messageType === 'pitchbend') {
      const val14 = Math.round(this.applyCurve(normalized, mapping.curve) * 16383);
      const lsb = val14 & 0x7f;
      const msb = (val14 >> 7) & 0x7f;
      const status = 0xe0 | chByte;
      outPort?.send([status, lsb, msb]);
      this.emitLog({
        direction: 'out',
        portName,
        channel: ch,
        type: 'PitchBend',
        label,
        data1: lsb,
        data2: msb,
        rawHex: `${status.toString(16).toUpperCase()} ${lsb.toString(16).padStart(2, '0').toUpperCase()} ${msb.toString(16).padStart(2, '0').toUpperCase()}`,
      });
    } else if (mapping.messageType === 'program') {
      const pgm = this.scaleMidiValue(normalized, mapping);
      const status = 0xc0 | chByte;
      outPort?.send([status, pgm]);
      this.emitLog({
        direction: 'out',
        portName,
        channel: ch,
        type: 'Program',
        label,
        data1: pgm,
        data2: 0,
        rawHex: `${status.toString(16).toUpperCase()} ${pgm.toString(16).padStart(2, '0').toUpperCase()}`,
      });
    } else if (mapping.messageType === 'note') {
      const note = Math.max(0, Math.min(127, mapping.ccNumber));
      const vel = this.scaleMidiValue(normalized, mapping);
      const status = vel > 0 ? 0x90 | chByte : 0x80 | chByte;
      outPort?.send([status, note, vel]);
      this.emitLog({
        direction: 'out',
        portName,
        channel: ch,
        type: vel > 0 ? 'Note On' : 'Note Off',
        label,
        data1: note,
        data2: vel,
        rawHex: `${status.toString(16).toUpperCase()} ${note.toString(16).padStart(2, '0').toUpperCase()} ${vel.toString(16).padStart(2, '0').toUpperCase()}`,
      });
    }
  }

  public sendNoteOn(label: string, channel: number, note: number, velocity = 100) {
    const ch = Math.max(1, Math.min(16, channel));
    const n = Math.max(0, Math.min(127, note));
    const v = Math.max(1, Math.min(127, velocity));
    const status = 0x90 | (ch - 1);
    this.getActiveOutputPort()?.send([status, n, v]);
    this.emitLog({
      direction: 'out',
      portName: this.getPortDisplayName(),
      channel: ch,
      type: 'Note On',
      label,
      data1: n,
      data2: v,
      rawHex: `${status.toString(16).toUpperCase()} ${n.toString(16).padStart(2, '0').toUpperCase()} ${v.toString(16).padStart(2, '0').toUpperCase()}`,
    });
  }

  public sendNoteOff(label: string, channel: number, note: number) {
    const ch = Math.max(1, Math.min(16, channel));
    const n = Math.max(0, Math.min(127, note));
    const status = 0x80 | (ch - 1);
    this.getActiveOutputPort()?.send([status, n, 0]);
    this.emitLog({
      direction: 'out',
      portName: this.getPortDisplayName(),
      channel: ch,
      type: 'Note Off',
      label,
      data1: n,
      data2: 0,
      rawHex: `${status.toString(16).toUpperCase()} ${n.toString(16).padStart(2, '0').toUpperCase()} 00`,
    });
  }

  private handleIncomingMidi(portName: string, event: MIDIMessageEvent) {
    const data = event.data;
    if (!data || data.length < 2) return;
    const status = data[0];
    const msgType = status & 0xf0;
    const ch = (status & 0x0f) + 1;
    const d1 = data[1] ?? 0;
    const d2 = data[2] ?? 0;

    if (status >= 0xf8) return; // ignore clock spam

    let typeLabel = 'Other';
    if (msgType === 0xb0) typeLabel = 'CC';
    else if (msgType === 0x90) typeLabel = d2 > 0 ? 'Note On' : 'Note Off';
    else if (msgType === 0x80) typeLabel = 'Note Off';
    else if (msgType === 0xe0) typeLabel = 'PitchBend';

    if (this.learnCallback && (msgType === 0xb0 || msgType === 0x90)) {
      const cb = this.learnCallback;
      this.learnCallback = null;
      cb(ch, d1, msgType === 0x90);
    }

    this.emitLog({
      direction: 'in',
      portName,
      channel: ch,
      type: typeLabel,
      label: 'External Hardware',
      data1: d1,
      data2: d2,
      rawHex: Array.from(data)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' '),
    });
  }
}

export const midiEngine = new MidiRouterEngine();
