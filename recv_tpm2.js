/* 
PowerMeter Chrome App
 Copyright (C) Sebastian Foerster

 This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 
*/

var tpm2 = {
    IDLE: 0,
    STARTB: 1,
    STARTB2: 2,
    STARTB3: 3,
    STARTB4: 4,
    STARTB5: 5,
    STARTB6: 6,
    ENDB: 7
};

var tpm2_proto = {
    TPM2_BLOCK_START: 0xC9,
    TPM2_BLOCK_DATAFRAME: 0xDA,
    TPM2_BLOCK_END: 0x36,
    TPM2_ACK: 0xAC,
    PM_DATAFRAME: 0xDA,
    PM_SCALEVALUES: 0x5C,
    PM_SENDSCALE: 0x5D,
    PM_HELLO: 0x11,
    PM_START: 0x5A,
    PM_STOP: 0x50,
    PM_BOOTLOADER: 0xB0
};

function Proto_handler(callback_list)
{
    this.tpm2state = tpm2.IDLE;
    this.count = 0;
    this.msg = [];
    this.framesize = 0;

    this.callbacks = callback_list;

    this.scale_V = 0.0;
    this.scale_C = 0.0;
    this.scale_CH = 0.0;

    this.scale_current = 0.0;

    this.current_rounder = 0;

    this.hall_active = false;
    this.current_mode = 0;

    this.recording = false;

    this.storage_VC = [];

    //used to filter
    this.update_rate_csv = 1; //1 = 1000 Hz; 10 = 100Hz; 100 = 10 Hz
    this.counter_rate_csv = 0;
    this.voltage_mean = 0.0;
    this.current_mean = 0.0;
}
 
Proto_handler.prototype.parse_tpm2 = function(buffer)
{
    //console.log("HID buffer recv " + buffer.length + "\n");

    if (buffer.length > 64)
        return false;

    //temp buffer
    msg = new Uint8Array(64);

    //ported from C# app... looks a bit weird
    for (var i = 0; i < buffer.length; i++)
    {
        var buf = buffer[i];

        if (this.tpm2state == tpm2.STARTB4)
        {
            if (this.count < this.framesize)
            {
                msg[this.count] = buf;
                this.count++;
            }
            else
                this.tpm2state = tpm2.ENDB;
        }

        //check for start- and sizebyte
        if (this.tpm2state == tpm2.IDLE && buf == tpm2_proto.TPM2_BLOCK_START)
        {
            //console.log("Startbyte 1 detected\n");
            this.tpm2state = tpm2.STARTB;
            continue;
        }

        if (this.tpm2state == tpm2.STARTB && buf == tpm2_proto.TPM2_BLOCK_DATAFRAME)
        {
            //console.log("Startbyte 2 detected\n");
            this.tpm2state = tpm2.STARTB2;
            continue;
        }

        if ( this.tpm2state == tpm2.STARTB2)
        {
            //console.log("Startbyte 3 detected\n");
            this.framesize = buf << 8;
            this.tpm2state = tpm2.STARTB3;
            continue;
        }

        if ( this.tpm2state == tpm2.STARTB3)
        {
            //console.log("Startbyte 4 detected\n");
            this.framesize += buf;
            if (this.framesize <= 64)
            {
                this.count = 0;
                this.tpm2state = tpm2.STARTB4;
            }
            else this.tpm2state = tpm2.IDLE;

            continue;

        }

        //check end byte
        if ( this.tpm2state == tpm2.ENDB)
        {
            //console.log("Endbyte detected\n");
            if (buf == tpm2_proto.TPM2_BLOCK_END)
            {
                this.count--;
                var cutted = new Uint8Array(msg.buffer, 1, this.count);
                if (this.count >= 4 && msg[0] == tpm2_proto.PM_DATAFRAME)
                {
                    this.recv_new_data(cutted);
                } else if (this.count >= 15 && msg[0] == tpm2_proto.PM_SCALEVALUES)
                {
                    
                    this.recv_scale_values(cutted);
                } else if (this.count >= 6 && msg[0] == tpm2_proto.PM_HELLO)
                {
                    //recv_device_id();
                }
            }

            this.tpm2state = tpm2.IDLE;
        }
    }
};

var packet_counter = 0;

Proto_handler.prototype.recv_new_data = function (buffer) 
{
 
    var scale_current = 0.0;

    if (this.hall_active)
    {
        scale_current = this.scale_CH;
    }
    else
    {
        scale_current = this.scale_C;
    }

    var dataview = new DataView(buffer.buffer);
    var little_endian_read = true;

    var voltage = 0.0;
    var current = 0.0;

    for (var i = 1; i < buffer.length; i += 4)
    {
        voltage = dataview.getUint16(i, little_endian_read) * this.scale_V;
        current = dataview.getInt16(i + 2, little_endian_read) * scale_current;


        if (this.recording) {
            //filter for a csv with less value pairs
            this.voltage_mean += voltage;
            this.current_mean += current;

            this.counter_rate_csv++;
            if (this.counter_rate_csv >= this.update_rate_csv) {
                var volt_f = this.voltage_mean / this.counter_rate_csv;
                var curr_f = this.current_mean / this.counter_rate_csv;

                this.counter_rate_csv = 0;

                var round_v_f = Math.round(volt_f * 100.0) / 100;
                var round_i_f = Math.round(curr_f * Math.pow(10.0, this.current_rounder)) / Math.pow(10.0, this.current_rounder);

                var now = new Date();
                var now_string = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds() + '.' + now.getMilliseconds();

                this.storage_VC.push({ time: now_string, voltage: round_v_f, current: round_i_f });

                this.voltage_mean = 0.0;
                this.current_mean = 0.0;
            }
        }

        var round_v = Math.round(voltage * 100.0) / 100;
        var round_i = Math.round(current * Math.pow(10.0, this.current_rounder)) / Math.pow(10.0, this.current_rounder);

        packet_counter++;
        if (packet_counter % 100 == 0) {
            console.log("Pakete: " + packet_counter);
            this.callbacks.new_data(round_v, round_i);
        }

        //console.log("V: " + voltage.toFixed(2) + " A: " + current.toFixed(this.current_rounder));
    }


}

Proto_handler.prototype.recv_scale_values = function (buffer)
{

    console.log("Scale values recv\n");

    if (buffer.length < 15) return;

    var dataview = new DataView(buffer.buffer);

    var little_endian_read = true;

    var scale_V_t = dataview.getFloat32(2, little_endian_read);
    var scale_C_t = dataview.getFloat32(2 + 5, little_endian_read);
    var scale_CH_t = dataview.getFloat32(2 + 5 + 5, little_endian_read);

    var hall_active_t = this.hall_active;

    if ((buffer[10] & 0x04) > 0) {
        if (this.hall_active == false) {
            this.hall_active = true;
            //UpdateNickname();
        }
        else {
            this.hall_active = true;
        }

        this.scale_current = this.scale_CH;

    }
    else {
        if (this.hall_active == true) {
            this.hall_active = false;
            //UpdateNickname();
        }
        else {
            this.hall_active = false;
        }

        this.scale_current = this.scale_C;
    }

    var current_mode = 0;

    if ((buffer[10] & 0x01) > 0 && (buffer[5] & 0x01) > 0) {
        current_mode = 2;
    }
    else if ((buffer[10] & 0x01) > 0 && (buffer[5] & 0x01) <= 0) {
        current_mode = 0;
    }
    else {
        current_mode = 1;
    }

    if (this.scale_current * 4000 > 0.1) {
        this.current_rounder = 4;
    }
    else if (this.scale_current * 4000 > 1.0) {
        this.current_rounder = 3;
    }
    else if (this.scale_current * 4000 > 10.0) {
        this.current_rounder = 2;
    }
    else if (this.scale_current * 4000 > 100.0) {
        this.current_rounder = 1;
    }
    else if (this.scale_current * 4000 > 1000.0) {
        this.current_rounder = 0;
    }

    if (this.scale_V !== scale_V_t || this.scale_C !== scale_C_t || this.scale_CH !== scale_CH_t || this.hall_active !== hall_active_t)
    {
        //something has changed... update
        this.callbacks.scale_values_changed(scale_V_t, scale_C_t);
    }

    this.scale_V = scale_V_t
    this.scale_C = scale_C_t
    this.scale_CH = scale_CH_t

    //console.log("Value V: " + this.scale_V.toString());
    //console.log("Value C: " + this.scale_C.toString());
    //console.log("Value CH: " + this.scale_CH.toString());
};

Proto_handler.prototype.start_recording = function (update_rate) {
    this.counter_rate_csv = 0;
    this.update_rate_csv = update_rate;
    this.voltage_mean = 0.0;
    this.current_mean = 0.0;
    this.storage_VC = [];
    this.recording = true;
};

Proto_handler.prototype.stop_recording = function () {
    this.recording = false;
    return this.storage_VC.length;
};


Proto_handler.prototype.save_recorded_to_file = function (writableEntry, callback)
{
    if (!writableEntry) {
        console.log('Nothing selected.');
        return;
    }
    
    var filestr = 'time;U/V;I/A\n';

    for (var i in this.storage_VC) {
        filestr += this.storage_VC[i].time + ';' + this.storage_VC[i].voltage + ';' + this.storage_VC[i].current + '\n';
    }

    var blob = new Blob([filestr], { type: 'text/plain' });

    writableEntry.createWriter(function (writer) {

        var truncated = false;
        writer.onwriteend = function (e) {
            if (!truncated) {
                truncated = true;
                writer.truncate(writer.position);
                return;
            }
            this.storage_VC = [];
            if (callback != undefined) {
                callback();
            }
        };

        writer.onerror = function (e) {
            console.warn('Write failed: ' + e.toString());
        };

        writer.write(blob);

    }, function (e) {
        console.warn('Write failed: ' + e.toString());
    }).bind(this);
};